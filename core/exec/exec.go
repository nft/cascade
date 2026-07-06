// Package exec runs a graph node by node in ExecutionOrder, dispatching per
// node type (plan 06 T2): http nodes call the injected HTTP runner, transform
// nodes run in-process via core/transform, and note nodes are never
// scheduled. The real HTTP pipeline arrives with M1 WP4; until then callers
// inject it, which also keeps tests network-free.
package exec

import (
	"context"
	"fmt"
	"time"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/transform"
)

// Status is a node's outcome within one run.
type Status string

const (
	StatusSuccess Status = "success"
	StatusFailed  Status = "failed"
	StatusSkipped Status = "skipped"
)

// HTTPFunc performs one http node call and returns its captured output.
type HTTPFunc func(ctx context.Context, node core.Node, env *binding.Env) (*binding.Output, error)

// Options configures one run.
type Options struct {
	// HTTP is the http-node runner; a graph with http nodes requires it.
	HTTP HTTPFunc
	// Transforms holds each transform node's spec.
	Transforms map[core.NodeID]transform.Spec
	// Exports holds declared output aliases by node ID.
	Exports map[core.NodeID][]binding.Export
	// Keys maps node IDs to board-unique keys; scripts read ancestors as
	// `nodes.<key>`. Nodes absent here fall back to their ID.
	Keys map[core.NodeID]string
	// TransformTimeout bounds each script's wall time; zero means
	// transform.DefaultTimeout.
	TransformTimeout time.Duration
}

// Record is one run-log entry. Type selects the variant: http records carry
// the response status; transform records carry the upstream keys consumed
// and the produced body (no URL/status — LogsPanel renders a variant row).
type Record struct {
	Node     core.NodeID
	Type     core.NodeType
	Duration time.Duration
	Err      string
	// Status is the HTTP response status (http records only).
	Status int
	// InputNodes are the direct upstream keys consumed (transform records only).
	InputNodes []string
	// Output is the produced body (transform records only; M8 decides retention).
	Output any
}

// Result is one run's outcome. Note nodes appear in none of the maps.
type Result struct {
	Statuses map[core.NodeID]Status
	Outputs  map[core.NodeID]*binding.Output
	Records  []Record
}

// Run executes the whole graph. Graph-shape errors (cycle, bad edge, type
// rules) fail the run up front; a node error fails that node and skips its
// descendants, like the UI does.
func Run(ctx context.Context, g *core.Graph, opts Options) (*Result, error) {
	if err := g.Validate(); err != nil {
		return nil, err
	}
	order, err := g.ExecutionOrder()
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
	exports := make(map[string][]binding.Export, len(opts.Exports))
	for id, ex := range opts.Exports {
		exports[string(id)] = ex
	}

	result := &Result{
		Statuses: make(map[core.NodeID]Status),
		Outputs:  make(map[core.NodeID]*binding.Output),
	}
	envOutputs := make(map[string]*binding.Output)

	for _, id := range order {
		node := nodesByID[id]
		if node.EffectiveType() == core.NodeTypeNote {
			continue // annotations are never scheduled
		}
		ups := upstreams[id]
		if skipped(result.Statuses, ups) {
			result.Statuses[id] = StatusSkipped
			continue
		}

		env := &binding.Env{
			Outputs:   envOutputs,
			Exports:   exports,
			Upstreams: idStrings(ups),
		}
		start := time.Now()
		out, runErr := dispatch(ctx, node, env, ups, envOutputs, opts)
		record := Record{Node: id, Type: node.EffectiveType(), Duration: time.Since(start)}
		if record.Type == core.NodeTypeTransform {
			record.InputNodes = nodeKeys(ups, opts.Keys)
		}
		if runErr != nil {
			record.Err = runErr.Error()
			result.Statuses[id] = StatusFailed
			result.Records = append(result.Records, record)
			continue
		}
		if record.Type == core.NodeTypeHTTP {
			record.Status = out.Status
		} else {
			record.Output = out.Body
		}
		result.Statuses[id] = StatusSuccess
		result.Outputs[id] = out
		envOutputs[string(id)] = out
		result.Records = append(result.Records, record)
	}
	return result, nil
}

func dispatch(
	ctx context.Context,
	node core.Node,
	env *binding.Env,
	ups []core.NodeID,
	outputs map[string]*binding.Output,
	opts Options,
) (*binding.Output, error) {
	switch node.EffectiveType() {
	case core.NodeTypeHTTP:
		if opts.HTTP == nil {
			return nil, fmt.Errorf("exec: no HTTP runner configured for node %q", node.ID)
		}
		return opts.HTTP(ctx, node, env)
	case core.NodeTypeTransform:
		spec, ok := opts.Transforms[node.ID]
		if !ok {
			return nil, fmt.Errorf("exec: transform node %q has no spec", node.ID)
		}
		in := transform.Input{
			Env:     env,
			Nodes:   keyedOutputs(outputs, opts.Keys),
			Timeout: opts.TransformTimeout,
		}
		if len(ups) == 1 {
			in.Res = outputs[string(ups[0])]
		}
		return transform.Execute(spec, in)
	}
	return nil, fmt.Errorf("exec: node %q has non-executable type %q", node.ID, node.Type)
}

// skipped reports whether any direct upstream did not succeed; skips cascade
// because a skipped upstream is itself not success.
func skipped(statuses map[core.NodeID]Status, ups []core.NodeID) bool {
	for _, up := range ups {
		if statuses[up] != StatusSuccess {
			return true
		}
	}
	return false
}

// keyedOutputs re-keys already-produced outputs by node key for script
// access (`nodes.<key>`).
func keyedOutputs(outputs map[string]*binding.Output, keys map[core.NodeID]string) map[string]*binding.Output {
	keyed := make(map[string]*binding.Output, len(outputs))
	for id, out := range outputs {
		keyed[nodeKey(core.NodeID(id), keys)] = out
	}
	return keyed
}

func nodeKey(id core.NodeID, keys map[core.NodeID]string) string {
	if key, ok := keys[id]; ok && key != "" {
		return key
	}
	return string(id)
}

func nodeKeys(ids []core.NodeID, keys map[core.NodeID]string) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = nodeKey(id, keys)
	}
	return out
}

func idStrings(ids []core.NodeID) []string {
	out := make([]string, len(ids))
	for i, id := range ids {
		out[i] = string(id)
	}
	return out
}
