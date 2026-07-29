package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"runtime/debug"
	"strings"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/exec"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
	"cascade/store"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// RunTarget mirrors the canvas run affordances: a node's Play button runs the
// downstream chain, the context menu offers upstream ("run what this needs")
// and component ("run everything connected"). Scope is one of core.Scope.
type RunTarget struct {
	Node  string `json:"node"`
	Scope string `json:"scope"`
}

// RunCapture is a node's captured response, in the shape the frontend
// persists (model.ts CapturedResponse).
type RunCapture struct {
	Status    int               `json:"status"`
	Headers   map[string]string `json:"headers,omitempty"`
	Body      any               `json:"body"`
	At        string            `json:"at"`
	Truncated bool              `json:"truncated,omitempty"`
}

// RunRequest is one board run. The board is the LIVE canvas, not the stored
// one: saving is debounced and can be rejected, so the file may lag.
type RunRequest struct {
	RunID string `json:"runId"`
	// BoardID scopes emitted events (plan 11 D17). The run holds its own copy
	// of the board, so it outlives a board switch, and node ids collide across
	// projects by construction.
	BoardID string      `json:"boardId"`
	Board   store.Board `json:"board"`
	Target  *RunTarget  `json:"target,omitempty"`
	// Seed carries captures for nodes OUTSIDE the run set, so a targeted run
	// resolves bindings against earlier runs.
	Seed map[string]RunCapture `json:"seed,omitempty"`
}

// RunResult closes a run. Per-node data travels as run:event; this is the
// terminal reconciliation, so a UI event the Wails bus drops cannot leave the
// canvas wrong. It is scoped like every event: the frontend verifies the
// (project, board) pair before applying it.
type RunResult struct {
	RunID     string            `json:"runId"`
	ProjectID string            `json:"projectId"`
	BoardID   string            `json:"boardId"`
	Statuses  map[string]string `json:"statuses"`
	Notes     map[string]string `json:"notes,omitempty"`
	Cancelled bool              `json:"cancelled,omitempty"`
}

// RunBoard executes the board and streams RunEventName until it finishes.
// Only one run may be in flight per app instance.
func (a *App) RunBoard(projectID string, req RunRequest) (RunResult, error) {
	if strings.TrimSpace(req.RunID) == "" {
		return RunResult{}, errors.New(errMissingRunID)
	}
	envBase, err := a.environmentBases(projectID)
	if err != nil {
		return RunResult{}, err
	}
	specs := decodeSpecs(req.Board)
	credentials := a.resolveRunCredentials(projectID, specs)

	ctx, cancel := context.WithCancel(a.baseContext())
	defer cancel()
	if err := a.beginRun(req.RunID, cancel); err != nil {
		return RunResult{}, err
	}
	defer a.endRun(req.RunID)

	rc := newRunContext(projectID, req.BoardID, req.Board, specs)
	events := make(chan exec.Event, runEventBuffer)
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		// A bare range, deliberately: the engine's send is unconditional, so a
		// drainer that stops reading before the channel closes wedges the run
		// forever. EventsEmit is itself non-blocking, so there is nothing here
		// worth guarding against.
		for e := range events {
			a.publishRunEvent(rc.event(e))
		}
	}()

	graph := req.Board.Graph()
	result, runErr := runGraph(ctx, exec.Run, &graph, exec.Options{
		RunID:     req.RunID,
		Specs:     specs,
		Transport: runTransport(a.client, credentials),
		EnvBase:   envBase,
		Seed:      runSeed(req.Seed),
		Target:    runTargetOf(req.Target),
		Events:    events,
	}, events)
	<-drained
	if runErr != nil {
		return RunResult{}, runErr
	}
	return rc.result(req.RunID, result), nil
}

// StopRun cancels the identified run. An unknown or already-finished id is a
// no-op, so a double click cannot error.
func (a *App) StopRun(runID string) error {
	a.runMu.Lock()
	defer a.runMu.Unlock()
	if runID == "" || a.runID != runID || a.runCancel == nil {
		return nil
	}
	a.runCancel()
	return nil
}

// graphRunner is exec.Run's shape, taken as a parameter so runGraph's panic
// guard can be exercised without an engine bug to trigger it.
type graphRunner func(context.Context, *core.Graph, exec.Options) (*exec.Result, error)

// runGraph executes the graph and closes the event channel on the way out.
// The recover has to live in the same function that closes the channel: an
// engine panic must fail the run rather than the app, and if it escaped
// without closing, the drain goroutine would block forever and RunBoard would
// never return.
func runGraph(
	ctx context.Context,
	run graphRunner,
	g *core.Graph,
	opts exec.Options,
	events chan exec.Event,
) (result *exec.Result, err error) {
	defer close(events)
	defer func() {
		r := recover()
		if r == nil {
			return
		}
		log.Printf("run %s panicked: %v\n%s", opts.RunID, r, debug.Stack())
		err = fmt.Errorf(runPanicFormat, r)
		// The engine emits run.finished on every exit path it controls; a
		// panic is not one of them, so the stream is closed off by hand and a
		// listener still sees the run end.
		events <- exec.Event{Kind: exec.EventRunFinished, RunID: opts.RunID, Err: err.Error()}
	}()
	return run(ctx, g, opts)
}

// beginRun registers the run, rejecting a second concurrent one. The guard is
// server-side because the frontend's own isRunning flag does not survive a
// reload.
func (a *App) beginRun(runID string, cancel context.CancelFunc) error {
	a.runMu.Lock()
	defer a.runMu.Unlock()
	if a.runID != "" {
		return errors.New(errRunInFlight)
	}
	a.runID, a.runCancel = runID, cancel
	return nil
}

func (a *App) endRun(runID string) {
	a.runMu.Lock()
	defer a.runMu.Unlock()
	if a.runID == runID {
		a.runID, a.runCancel = "", nil
	}
}

// publishRunEvent hands one DTO to the frontend.
func (a *App) publishRunEvent(e runEvent) {
	if a.emitRunEvent == nil {
		return
	}
	a.emitRunEvent(e)
}

// emitRunEvent is NewApp's default publisher. A nil context means no Wails
// runtime is attached (tests, headless), and EventsEmit would dereference it.
func (a *App) emitToRuntime(e runEvent) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, RunEventName, e)
}

// baseContext is the app's Wails context, or a detached one when no runtime
// is attached.
func (a *App) baseContext() context.Context {
	if a.ctx == nil {
		return context.Background()
	}
	return a.ctx
}

// decodeSpecs reads every node's form data into its typed spec.
//
// A decode failure is recorded against that node rather than returned: one
// unreadable node must not abort the board with no indication of which node it
// was. Today the only failure is an unknown node type, which Graph.Validate
// rejects first with a message that does name the node — so this is the guard
// for error paths Decode may grow later.
func decodeSpecs(board store.Board) map[core.NodeID]nodespec.Spec {
	specs := make(map[core.NodeID]nodespec.Spec, len(board.Nodes))
	for _, n := range board.Nodes {
		kind := core.NodeType(n.Type)
		spec, err := nodespec.Decode(kind, n.Data)
		if err != nil {
			log.Printf("run: node %s: %v", n.ID, err)
			spec = nodespec.Spec{Kind: kind}
		}
		specs[core.NodeID(n.ID)] = spec
	}
	return specs
}

// environmentBases reads the project's environments once and closes over a
// plain map. The read must finish before the run starts: store.Project
// serializes every file access behind one coarse mutex, and a run holding it
// would queue every debounced board save behind itself.
func (a *App) environmentBases(projectID string) (exec.EnvBaseFunc, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return nil, err
	}
	environments, err := p.Environments()
	if err != nil {
		return nil, err
	}
	bases := make(map[string]string, len(environments))
	for _, e := range environments {
		bases[e.Name] = e.BaseURL
	}
	// An unknown name is not an error the caller reports: BuildRequest turns
	// any failure here into the one message that names both ways out.
	return func(name string) (string, error) {
		base, ok := bases[name]
		if !ok {
			return "", fmt.Errorf("environment %q is not defined in this project", name)
		}
		return base, nil
	}, nil
}

// runCredential is one resolved credential, or the reason it could not be.
type runCredential struct {
	credential *httpcall.Credential
	err        error
}

// resolveRunCredentials reads each distinct credential the board names, once
// per name rather than once per call. A name that fails is stored, not
// returned: only the nodes using it fail, which leaves the other branches
// runnable and matches how the engine tiers config problems.
func (a *App) resolveRunCredentials(projectID string, specs map[core.NodeID]nodespec.Spec) map[string]runCredential {
	resolved := make(map[string]runCredential)
	for _, spec := range specs {
		if spec.HTTP == nil || spec.HTTP.Credential == "" {
			continue
		}
		name := spec.HTTP.Credential
		if _, done := resolved[name]; done {
			continue
		}
		credential, err := a.resolveCredential(projectID, name)
		resolved[name] = runCredential{credential: credential, err: err}
	}
	return resolved
}

// runTransport is the engine's one route to the network. Only the credential
// NAME crosses into the engine; this closure is where it becomes a secret.
func runTransport(client *http.Client, credentials map[string]runCredential) exec.Transport {
	return func(ctx context.Context, req httpcall.Request, name string) (httpcall.Response, error) {
		c := credentials[name]
		if c.err != nil {
			return httpcall.Response{}, c.err
		}
		return httpcall.Do(ctx, client, req, c.credential)
	}
}

func runTargetOf(t *RunTarget) *exec.Target {
	if t == nil {
		return nil
	}
	return &exec.Target{Node: core.NodeID(t.Node), Scope: core.Scope(t.Scope)}
}

func runSeed(seed map[string]RunCapture) map[core.NodeID]*binding.Output {
	if len(seed) == 0 {
		return nil
	}
	outputs := make(map[core.NodeID]*binding.Output, len(seed))
	for id, capture := range seed {
		outputs[core.NodeID(id)] = capture.output()
	}
	return outputs
}

func (c RunCapture) output() *binding.Output {
	header := make(http.Header, len(c.Headers))
	for name, value := range c.Headers {
		header.Set(name, value)
	}
	return &binding.Output{Status: c.Status, Header: header, Body: c.Body, Truncated: c.Truncated}
}
