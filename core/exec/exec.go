// Package exec runs a graph node by node in ExecutionOrder, dispatching per
// node type: http nodes are built from their spec and sent
// through the injected Transport, transform nodes run in-process via
// core/transform, and note nodes are never scheduled. The HTTP pipeline lives
// in core/httpcall and reaches this package only through Transport, so exec
// stays independent of the transport and tests run network- and keychain-free.
package exec

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/nodespec"
	"cascade/core/transform"
)

// Status is a node's outcome within one run.
type Status string

const (
	StatusSuccess Status = "success"
	StatusFailed  Status = "failed"
	StatusSkipped Status = "skipped"
)

// DefaultMockStatus is the output status a mock node reports when its spec
// leaves Status zero, so downstream `status` bindings behave like a real call.
const DefaultMockStatus = 200

// Options configures one run.
type Options struct {
	// RunID identifies this run in every emitted event and log row.
	RunID string
	// Specs holds each node's typed configuration, keyed by node ID.
	Specs map[core.NodeID]nodespec.Spec
	// Transport performs http calls; a graph with http nodes requires it.
	Transport Transport
	// EnvBase resolves environment names to base URLs.
	EnvBase EnvBaseFunc
	// Seed pre-loads outputs produced by earlier runs, so a targeted run can
	// resolve bindings against nodes outside its set. Entries for nodes inside
	// the run set are ignored — a re-run never reads its own stale capture.
	Seed map[core.NodeID]*binding.Output
	// Target restricts the run to a subgraph; nil runs everything.
	Target *Target
	// Events receives the live stream; nil disables streaming.
	Events chan<- Event
	// TransformTimeout bounds each script's wall time; zero means
	// transform.DefaultTimeout.
	TransformTimeout time.Duration
}

// Record is one run-log entry. Type selects the variant: http records carry
// the response status and the full call detail; transform records carry the
// upstream keys consumed and the produced body; mock records carry the
// produced body only (no URL/status — LogsPanel renders a variant row); delay
// records carry the duration only (their output is a pass-through duplicate,
// or null); for records are whole-loop summaries (iteration count and duration
// — the aggregate body lives in Outputs, per-iteration detail in child
// records).
type Record struct {
	Node core.NodeID
	Type core.NodeType
	// Time is when the node started, for the run log's wall-clock column.
	Time     time.Time
	Duration time.Duration
	Err      string
	// Status is the HTTP response status (http records only).
	Status int
	// HTTP carries the call detail for http records — set on failure records
	// too, so a 422 row still shows its URL and response body.
	HTTP *CallDetail
	// InputNodes are the direct upstream keys consumed (transform records only).
	InputNodes []string
	// Output is the produced body (transform and mock records only).
	Output any
	// Iteration is the loop iteration index for records emitted inside a
	// for node's body; -1 outside any loop.
	Iteration int
	// Iterations is the number of iterations that ran to completion (for
	// summary records only).
	Iterations int
}

// Result is one run's outcome. Note nodes appear in none of the maps, and
// neither do nodes a Target excluded — the canvas leaves their previous state
// alone rather than repainting them.
type Result struct {
	Statuses map[core.NodeID]Status
	Outputs  map[core.NodeID]*binding.Output
	Records  []Record
	// Cancelled reports that the run stopped early on a cancelled context.
	Cancelled bool
}

// topLevelIteration marks records emitted outside any loop.
const topLevelIteration = -1

// runner carries one run's shared state; scope carries where a node runs
// (top level or one loop iteration), so runNode serves both without a
// second executor.
type runner struct {
	g         *core.Graph
	nodesByID map[core.NodeID]core.Node
	upstreams map[core.NodeID][]core.NodeID
	exports   map[string][]binding.Export
	opts      Options
	// runSet is the subgraph a Target restricted the run to; nil means the
	// whole graph.
	runSet map[core.NodeID]bool
	result *Result
	// loopRuns records each for node's completed iteration count for its
	// summary record (runFor's return value is the aggregate output).
	loopRuns map[core.NodeID]int
}

// scope is the context a node executes in. Loop iterations get their own
// statuses map (skips cascade per iteration) and outputs map (iteration
// k+1 starts clean — cross-iteration state is explicitly not a feature).
type scope struct {
	iteration int // topLevelIteration outside a loop
	item      any
	hasItem   bool
	outputs   map[string]*binding.Output
	statuses  map[core.NodeID]Status
	// rewrap maps a child's dispatch error to a loop-scope error (the
	// named ancestor-rule failure); nil outside loops.
	rewrap func(error) error
}

// Run executes the graph, or the subgraph Options.Target selects. Graph-shape
// errors (cycle, bad edge, containment rules) fail the run up front; a node
// error fails that node and skips its descendants, like the UI does.
//
// run.finished is emitted on every exit path, including the shape-error abort
// and cancellation, so a listener always sees the run end.
func Run(ctx context.Context, g *core.Graph, opts Options) (*Result, error) {
	result, err := execute(ctx, g, opts)
	finished := Event{Kind: EventRunFinished, RunID: opts.RunID}
	if err != nil {
		finished.Err = err.Error()
	}
	if result != nil {
		finished.Cancelled = result.Cancelled
	}
	emit(opts.Events, finished)
	return result, err
}

func execute(ctx context.Context, g *core.Graph, opts Options) (*Result, error) {
	if err := g.Validate(); err != nil {
		return nil, err
	}
	order, err := g.ExecutionOrder()
	if err != nil {
		return nil, err
	}
	runSet, err := resolveRunSet(g, opts.Target)
	if err != nil {
		return nil, err
	}

	nodesByID := make(map[core.NodeID]core.Node, len(g.Nodes))
	for _, n := range g.Nodes {
		nodesByID[n.ID] = n
	}
	upstreams := make(map[core.NodeID][]core.NodeID)
	for _, e := range g.Edges {
		upstreams[e.To] = append(upstreams[e.To], e.From)
	}
	exports := make(map[string][]binding.Export, len(opts.Specs))
	for id, spec := range opts.Specs {
		if len(spec.Exports) > 0 {
			exports[string(id)] = spec.Exports
		}
	}

	r := &runner{
		g:         g,
		nodesByID: nodesByID,
		upstreams: upstreams,
		exports:   exports,
		opts:      opts,
		runSet:    runSet,
		result: &Result{
			Statuses: make(map[core.NodeID]Status),
			Outputs:  make(map[core.NodeID]*binding.Output),
		},
		loopRuns: make(map[core.NodeID]int),
	}
	top := &scope{
		iteration: topLevelIteration,
		outputs:   make(map[string]*binding.Output),
		statuses:  r.result.Statuses,
	}
	// Only nodes this run will NOT produce are seeded: a re-run reading its own
	// previous capture would resolve bindings against data it is replacing.
	if runSet != nil {
		for id, out := range opts.Seed {
			if out != nil && !runSet[id] {
				top.outputs[string(id)] = out
			}
		}
	}

	r.emit(Event{Kind: EventRunStarted, Nodes: runNodes(g, runSet)})
	for _, id := range order {
		if ctx.Err() != nil {
			// Nodes never reached carry no status at all, so the canvas leaves
			// their previous state alone instead of painting a wall of colour.
			break
		}
		node := nodesByID[id]
		if node.EffectiveType() == core.NodeTypeNote {
			continue // annotations are never scheduled
		}
		if runSet != nil && !runSet[id] {
			continue
		}
		r.runNode(ctx, node, top)
	}
	// Read from the context, not from the break above: a run stopped while its
	// LAST node was in flight never re-enters the loop, and reporting that as
	// an uncancelled run tells the user their Stop did nothing.
	r.result.Cancelled = ctx.Err() != nil
	return r.result, nil
}

// spec returns a node's typed configuration.
func (r *runner) spec(id core.NodeID) (nodespec.Spec, bool) {
	spec, ok := r.opts.Specs[id]
	return spec, ok
}

// key is a node's board-unique key, which scripts read ancestors by
// (`nodes.<key>`); nodes without one fall back to their ID.
func (r *runner) key(id core.NodeID) string {
	if spec, ok := r.opts.Specs[id]; ok && spec.Key != "" {
		return spec.Key
	}
	return string(id)
}

func (r *runner) keys(ids []core.NodeID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = r.key(id)
	}
	return out
}

// runNode executes one node in the given scope: skip cascade, env build,
// dispatch, record. Loop children run through this exact path.
func (r *runner) runNode(ctx context.Context, node core.Node, sc *scope) {
	id := node.ID
	ups := r.upstreams[id]
	if r.skipped(sc.statuses, ups) {
		r.setStatus(id, sc, StatusSkipped)
		// A skip produces a status but no record, which is exactly why status
		// transitions have to be first-class events.
		r.emit(Event{Kind: EventNodeFinished, Node: id, Iteration: sc.iteration, Status: StatusSkipped})
		return
	}
	r.emit(Event{Kind: EventNodeStarted, Node: id, Iteration: sc.iteration})

	env := &binding.Env{
		Outputs:   sc.outputs,
		Exports:   r.exports,
		Upstreams: idStrings(ups),
		Index:     max(sc.iteration, 0),
		Item:      sc.item,
		HasItem:   sc.hasItem,
	}
	start := time.Now()
	out, detail, runErr := r.dispatch(ctx, node, env, ups, sc)
	record := Record{
		Node:      id,
		Type:      node.EffectiveType(),
		Time:      start,
		Duration:  time.Since(start),
		HTTP:      detail,
		Iteration: sc.iteration,
	}
	if record.Type == core.NodeTypeTransform {
		record.InputNodes = r.keys(ups)
	}
	if runErr != nil {
		if sc.rewrap != nil {
			runErr = sc.rewrap(runErr)
		}
		record.Err = runErr.Error()
		if record.Type == core.NodeTypeFor {
			record.Iterations = r.loopRuns[id]
		}
		r.setStatus(id, sc, StatusFailed)
		r.result.Records = append(r.result.Records, record)
		r.emit(Event{Kind: EventNodeFinished, Node: id, Iteration: sc.iteration, Status: StatusFailed, Record: &record})
		return
	}
	switch record.Type {
	case core.NodeTypeHTTP:
		record.Status = out.Status
	case core.NodeTypeDelay:
		// duration only — the body is a pass-through duplicate, or null
	case core.NodeTypeFor:
		record.Iterations = r.loopRuns[id]
	default:
		record.Output = out.Body
	}
	r.setStatus(id, sc, StatusSuccess)
	r.result.Outputs[id] = out
	sc.outputs[string(id)] = out
	r.result.Records = append(r.result.Records, record)
	r.emit(Event{Kind: EventNodeFinished, Node: id, Iteration: sc.iteration, Status: StatusSuccess, Record: &record, Output: out})
}

// setStatus writes a status into the scope (skip cascade) and the result
// (loop children keep their last iteration's state there).
func (r *runner) setStatus(id core.NodeID, sc *scope, s Status) {
	sc.statuses[id] = s
	r.result.Statuses[id] = s
}

func (r *runner) dispatch(
	ctx context.Context,
	node core.Node,
	env *binding.Env,
	ups []core.NodeID,
	sc *scope,
) (*binding.Output, *CallDetail, error) {
	switch node.EffectiveType() {
	case core.NodeTypeHTTP:
		return r.runHTTP(ctx, node, env)
	case core.NodeTypeMock:
		spec, ok := r.spec(node.ID)
		if !ok || spec.Mock == nil {
			return nil, nil, fmt.Errorf("exec: mock node %q has no spec", node.ID)
		}
		out, err := mockOutput(node.ID, *spec.Mock)
		return out, nil, err
	case core.NodeTypeDelay:
		spec, ok := r.spec(node.ID)
		if !ok || spec.Delay == nil {
			return nil, nil, fmt.Errorf("exec: delay node %q has no duration", node.ID)
		}
		out, err := delayOutput(ctx, node.ID, spec.Delay.Duration(), ups, sc.outputs)
		return out, nil, err
	case core.NodeTypeFor:
		out, err := r.runFor(ctx, node, sc)
		return out, nil, err
	case core.NodeTypeTransform:
		out, err := r.runTransform(node, env, ups, sc)
		return out, nil, err
	}
	return nil, nil, fmt.Errorf("exec: node %q has non-executable type %q", node.ID, node.Type)
}

func (r *runner) runTransform(
	node core.Node,
	env *binding.Env,
	ups []core.NodeID,
	sc *scope,
) (*binding.Output, error) {
	spec, ok := r.spec(node.ID)
	if !ok || spec.Transform == nil {
		return nil, fmt.Errorf("exec: transform node %q has no spec", node.ID)
	}
	// A transform only reshapes upstream data, so one with nothing upstream
	// cannot produce anything. Inside a for node the loop scope ({{item}},
	// {{i}}, loop ancestors) feeds it without an edge. This is a config-tier
	// rule and not a graph-shape one: the canvas creates an unconnected
	// transform in a single click, and failing the whole graph for it made
	// every save silently fail until the user drew an edge.
	if len(ups) == 0 && node.Parent == "" {
		return nil, fmt.Errorf("exec: transform node %q has no upstream node to reshape", node.ID)
	}
	engine, err := spec.Transform.Engine()
	if err != nil {
		return nil, fmt.Errorf("exec: transform node %q: %w", node.ID, err)
	}
	in := transform.Input{
		Env:     env,
		Nodes:   r.keyedOutputs(sc.outputs, r.readableAncestors(node)),
		Index:   env.Index,
		Item:    env.Item,
		HasItem: env.HasItem,
		Timeout: r.opts.TransformTimeout,
	}
	if len(ups) == 1 {
		in.Res = sc.outputs[string(ups[0])]
	}
	return transform.Execute(engine, in)
}

// mockOutput parses a mock node's authored body and wraps it as the node's
// output. Unparseable JSON is a config-tier failure: it fails only this node.
func mockOutput(id core.NodeID, spec nodespec.MockSpec) (*binding.Output, error) {
	var body any
	if err := json.Unmarshal([]byte(spec.Body), &body); err != nil {
		return nil, fmt.Errorf("exec: mock node %q: body is not valid JSON: %v", id, err)
	}
	status := spec.Status
	if status == 0 {
		status = DefaultMockStatus
	}
	return &binding.Output{Status: status, Body: body}, nil
}

// delayOutput waits the configured duration, then passes its single
// upstream's output through unchanged (same pointer — a delay spliced into
// an edge never rewrites downstream bindings). With zero or 2+ upstreams the
// output is Status 0 / nil body: a delay is a gate, not a joiner. The wait
// is ctx-aware so stopping a run interrupts a sleeping delay immediately.
func delayOutput(
	ctx context.Context,
	id core.NodeID,
	d time.Duration,
	ups []core.NodeID,
	outputs map[string]*binding.Output,
) (*binding.Output, error) {
	if d < nodespec.MinDelay || d > nodespec.MaxDelay {
		return nil, fmt.Errorf("exec: delay node %q: duration %v is outside %v..%v", id, d, nodespec.MinDelay, nodespec.MaxDelay)
	}
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
	case <-ctx.Done():
		return nil, fmt.Errorf("exec: delay node %q: %w", id, ctx.Err())
	}
	if len(ups) == 1 {
		return outputs[string(ups[0])], nil
	}
	return &binding.Output{Status: 0, Body: nil}, nil
}

// skipped reports whether any direct upstream did not succeed; skips cascade
// because a skipped upstream is itself not success.
//
// An upstream outside the run set is exempt: a targeted run deliberately does
// not execute it, so its absence from this run's statuses proves nothing. Its
// output, if the caller supplied one, came through Seed. Without the
// exemption a downstream-scope run would mark the very node the user clicked
// Play on as skipped and cascade from there.
func (r *runner) skipped(statuses map[core.NodeID]Status, ups []core.NodeID) bool {
	for _, up := range ups {
		if r.runSet != nil && !r.runSet[up] {
			continue
		}
		if statuses[up] != StatusSuccess {
			return true
		}
	}
	return false
}

// keyedOutputs re-keys the readable nodes' already-produced outputs by node
// key for script access (`nodes.<key>`). Everything that happened to run
// earlier is not the same set: after a paste re-keys a script's real
// upstream, the old key would otherwise go on reading the original node.
func (r *runner) keyedOutputs(outputs map[string]*binding.Output, readable map[core.NodeID]bool) map[string]*binding.Output {
	keyed := make(map[string]*binding.Output, len(readable))
	for id := range readable {
		if out, ok := outputs[string(id)]; ok {
			keyed[r.key(id)] = out
		}
	}
	return keyed
}

// readableAncestors is what a node may read: its ancestors and, for a loop
// child, its for node's — they ran before the loop and hold still across
// iterations. The for node itself is not one: its output is the aggregate
// the body is still producing.
func (r *runner) readableAncestors(node core.Node) map[core.NodeID]bool {
	ids := r.ancestorIDs(node.ID)
	if node.Parent != "" {
		for id := range r.ancestorIDs(node.Parent) {
			ids[id] = true
		}
	}
	return ids
}

func idStrings(ids []core.NodeID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = string(id)
	}
	return out
}
