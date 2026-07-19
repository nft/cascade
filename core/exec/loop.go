// For-node execution (plan 09): a for node is a container whose children
// form a loop body; runFor drives that body's sub-order through the same
// per-node dispatch the top level uses — one executor, two scopes.
package exec

import (
	"context"
	"errors"
	"fmt"
	"maps"

	"cascade/core"
	"cascade/core/binding"
)

// Loop modes (plan 09).
const (
	LoopModeCount = "count"
	LoopModeEach  = "each"
)

// Loop iteration bounds, enforced at dispatch (config tier): the UI clamps,
// but a hand-edited board must not spin a run for hours.
const (
	MinLoopCount      = 1
	MaxLoopIterations = 10_000
)

// LoopSpec is a for node's configuration: run the body Count times, or
// (each mode) once per element of the array Source resolves to. Source may
// only reference the for node's ancestors.
type LoopSpec struct {
	Mode  string
	Count int
	// Source is the each-mode array reference; an empty Node means the for
	// node's single direct upstream (res sugar).
	Source binding.Ref
}

// runFor executes a for node: per iteration it pushes a fresh loop scope —
// ancestor outputs plus {{i}}/{{item}} — runs the children in sub-order
// under the usual DAG rules, and aggregates every non-delay child's output
// keyed by child key. Fail-fast: a failed iteration aborts the rest and
// fails the for node. Config errors (empty body, bad count, non-array
// source) fail only this node.
func (r *runner) runFor(ctx context.Context, node core.Node, sc *scope) (*binding.Output, error) {
	id := node.ID
	spec, ok := r.opts.Loops[id]
	if !ok {
		return nil, fmt.Errorf("exec: for node %q has no spec", id)
	}
	children, err := r.g.ChildExecutionOrder(id)
	if err != nil {
		return nil, err
	}
	if len(children) == 0 {
		return nil, fmt.Errorf("exec: for node %q has no children", id)
	}

	// The only outside data the loop body may see: outputs of the for
	// node's ancestors — they ran before the loop and are constant across
	// iterations. A ref escaping this set must fail by name, never resolve
	// against whatever non-ancestor happened to run earlier.
	ancestors := r.ancestorIDs(id)
	base := make(map[string]*binding.Output, len(ancestors))
	for aid := range ancestors {
		if out, ok := sc.outputs[string(aid)]; ok {
			base[string(aid)] = out
		}
	}
	rewrap := func(err error) error { return r.loopRefError(err, id, ancestors) }

	srcEnv := &binding.Env{Outputs: base, Exports: r.exports, Upstreams: idStrings(r.upstreams[id])}
	iterations, items, err := loopIterations(id, spec, srcEnv)
	if err != nil {
		return nil, rewrap(err)
	}

	// Aggregate keyed by child key — stable under appending body steps;
	// delay children are excluded (pass-through duplicates, or null).
	bodies := make(map[string][]any)
	var aggregated []core.NodeID
	for _, cid := range children {
		if r.nodesByID[cid].EffectiveType() == core.NodeTypeDelay {
			continue
		}
		aggregated = append(aggregated, cid)
		bodies[nodeKey(cid, r.opts.Keys)] = []any{}
	}

	for k := range iterations {
		if err := ctx.Err(); err != nil {
			r.loopRuns[id] = k
			return nil, fmt.Errorf("exec: for node %q: %w", id, err)
		}
		iter := &scope{
			iteration: k,
			outputs:   maps.Clone(base),
			statuses:  make(map[core.NodeID]Status, len(children)),
			rewrap:    rewrap,
		}
		if items != nil {
			iter.item, iter.hasItem = items[k], true
		}
		failed := false
		for _, cid := range children {
			r.runNode(ctx, r.nodesByID[cid], iter)
			if iter.statuses[cid] == StatusFailed {
				failed = true
			}
		}
		if failed {
			r.loopRuns[id] = k
			return nil, fmt.Errorf("exec: for node %q: iteration %d failed", id, k)
		}
		for _, cid := range aggregated {
			key := nodeKey(cid, r.opts.Keys)
			bodies[key] = append(bodies[key], iter.outputs[string(cid)].Body)
		}
	}
	r.loopRuns[id] = iterations

	body := make(map[string]any, len(bodies))
	for key, outs := range bodies {
		body[key] = outs
	}
	return &binding.Output{Status: 0, Body: body}, nil
}

// loopIterations validates the spec (config tier) and returns the iteration
// count, plus the resolved elements in each mode (nil in count mode).
func loopIterations(id core.NodeID, spec LoopSpec, env *binding.Env) (int, []any, error) {
	switch spec.Mode {
	case LoopModeCount:
		if spec.Count < MinLoopCount || spec.Count > MaxLoopIterations {
			return 0, nil, fmt.Errorf("exec: for node %q: count %d is outside %d..%d", id, spec.Count, MinLoopCount, MaxLoopIterations)
		}
		return spec.Count, nil, nil
	case LoopModeEach:
		v, err := binding.Source{Kind: binding.KindRef, Ref: spec.Source}.Resolve(env)
		if err != nil {
			return 0, nil, fmt.Errorf("exec: for node %q: each source: %w", id, err)
		}
		items, ok := v.([]any)
		if !ok {
			return 0, nil, fmt.Errorf("exec: for node %q: each source must resolve to an array, got a JSON %s", id, jsonTypeName(v))
		}
		if len(items) > MaxLoopIterations {
			return 0, nil, fmt.Errorf("exec: for node %q: each source has %d elements, above the %d iteration cap", id, len(items), MaxLoopIterations)
		}
		return len(items), items, nil
	}
	return 0, nil, fmt.Errorf("exec: for node %q: unknown mode %q", id, spec.Mode)
}

// ancestorIDs returns the transitive upstream closure of a node.
func (r *runner) ancestorIDs(id core.NodeID) map[core.NodeID]bool {
	seen := make(map[core.NodeID]bool)
	stack := append([]core.NodeID(nil), r.upstreams[id]...)
	for len(stack) > 0 {
		n := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if seen[n] {
			continue
		}
		seen[n] = true
		stack = append(stack, r.upstreams[n]...)
	}
	return seen
}

// loopRefError renames a missing-output failure when the referenced node
// exists but is neither an ancestor of the loop nor part of its body: the
// stored ref escaped the loop's scope (plan 09 — e.g. the user cut an
// edge), and the named error says so. Genuine not-run errors (forward ref
// to a later sibling) pass through untouched.
func (r *runner) loopRefError(err error, forID core.NodeID, ancestors map[core.NodeID]bool) error {
	var notRun *binding.UpstreamNotRunError
	if !errors.As(err, &notRun) {
		return err
	}
	ref := core.NodeID(notRun.Node)
	n, exists := r.nodesByID[ref]
	if !exists || ancestors[ref] || n.Parent == forID {
		return err
	}
	return fmt.Errorf("exec: node %q is not an upstream of this loop", notRun.Node)
}

// jsonTypeName names a captured JSON value's type for error messages.
func jsonTypeName(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		return "string"
	case float64, int, int64:
		return "number"
	case map[string]any:
		return "object"
	default:
		return fmt.Sprintf("%T", v)
	}
}
