// Package core is Cascade's UI-independent engine: graph model, binding
// resolution, DAG execution, OpenAPI schema import, and log emission.
// It must stay free of Wails (and any UI) dependencies so it can back the
// desktop app, a headless CLI runner, or a server build alike.
package core

import "fmt"

// NodeID uniquely identifies a node within a graph.
type NodeID string

// NodeType discriminates what a node is. Only http nodes make
// requests; transform nodes reshape upstream data in-process; note nodes are
// canvas annotations and never execute; mock nodes emit user-authored
// static JSON, delay nodes hold their branch for a duration, and for nodes
// are containers that run their child nodes repeatedly. The discriminator
// plus per-type executor dispatch is the extension point for future types
// (condition, …).
type NodeType string

const (
	NodeTypeHTTP      NodeType = "http"
	NodeTypeTransform NodeType = "transform"
	NodeTypeNote      NodeType = "note"
	NodeTypeMock      NodeType = "mock"
	NodeTypeDelay     NodeType = "delay"
	NodeTypeFor       NodeType = "for"
)

func (t NodeType) valid() bool {
	switch t {
	case NodeTypeHTTP, NodeTypeTransform, NodeTypeNote, NodeTypeMock, NodeTypeDelay, NodeTypeFor:
		return true
	}
	return false
}

// Node is a single step in the graph. For http nodes that is one API call
// bound to an environment and a credential.
type Node struct {
	ID   NodeID   `json:"id"`
	Type NodeType `json:"type,omitempty"`
	Name string   `json:"name,omitempty"`
	// Parent is the For container this node lives in; empty means
	// top level.
	Parent NodeID `json:"parent,omitempty"`
}

// EffectiveType returns the node's type, treating the zero value as http:
// nodes predate the type discriminator, so both boards serialized before it
// existed and hand-constructed Node{} literals mean an http node.
func (n Node) EffectiveType() NodeType {
	if n.Type == "" {
		return NodeTypeHTTP
	}
	return n.Type
}

// Edge declares that To depends on From: To may bind to From's outputs and
// runs only after From succeeded.
type Edge struct {
	From NodeID `json:"from"`
	To   NodeID `json:"to"`
}

// Graph is a set of nodes and dependency edges. A valid graph is a DAG.
type Graph struct {
	Nodes []Node
	Edges []Edge
}

// ExecutionOrder returns the top-level node IDs in a valid execution order
// using Kahn's algorithm. Children of For containers are excluded — the For
// node executes them via ChildExecutionOrder — but every container's
// sub-order is still checked, so a cycle anywhere in the graph is an error.
// Ties are broken by node declaration order, so the result is deterministic.
// It also returns an error if an edge or a parent references an unknown node.
func (g *Graph) ExecutionOrder() ([]NodeID, error) {
	if err := g.checkRefs(); err != nil {
		return nil, err
	}
	seen := make(map[NodeID]bool)
	for _, n := range g.Nodes {
		if n.Parent == "" || seen[n.Parent] {
			continue
		}
		seen[n.Parent] = true
		if _, err := g.scopeOrder(n.Parent); err != nil {
			return nil, err
		}
	}
	return g.scopeOrder("")
}

// ChildExecutionOrder returns the direct children of the given For node in a
// valid execution order, under the same Kahn's/determinism/cycle rules as the
// top level. Only edges between two children of that For participate —
// boundary-crossing edges are rejected by Validate and ignored here.
func (g *Graph) ChildExecutionOrder(parent NodeID) ([]NodeID, error) {
	if err := g.checkRefs(); err != nil {
		return nil, err
	}
	return g.scopeOrder(parent)
}

// Scope selects which nodes a targeted run covers, mirroring the canvas
// affordances: a node's Play button runs the downstream chain, the context
// menu offers upstream ("run what this needs") and component ("run everything
// connected"). Ported from frontend/src/lib/graph.ts so a headless runner can
// target subgraphs without the UI.
type Scope string

const (
	ScopeUpstream   Scope = "upstream"
	ScopeDownstream Scope = "downstream"
	ScopeComponent  Scope = "component"
)

// Closure returns the node set a targeted run covers: target plus its
// transitive ancestors (upstream), target plus its transitive descendants
// (downstream), or target's whole weakly-connected component. The target is
// always included. Edge direction is ignored for ScopeComponent.
//
// Containment is transitive in both directions, and both halves are load
// bearing:
//
//   - Including a for node includes its children — a loop runs as a unit.
//   - Targeting a CHILD promotes the target to its for container (and that
//     container's container, if nested). A loop child has no meaning outside
//     its iteration: runFor owns the body's ordering, output cloning and
//     {{i}} binding, so a run set containing the child alone would dispatch a
//     node whose loop-scoped bindings cannot resolve.
func (g *Graph) Closure(target NodeID, scope Scope) (map[NodeID]bool, error) {
	switch scope {
	case ScopeUpstream, ScopeDownstream, ScopeComponent:
	default:
		return nil, fmt.Errorf("unknown run scope %q", scope)
	}
	if err := g.checkRefs(); err != nil {
		return nil, err
	}
	parent := make(map[NodeID]NodeID, len(g.Nodes))
	children := make(map[NodeID][]NodeID)
	known := make(map[NodeID]bool, len(g.Nodes))
	for _, n := range g.Nodes {
		known[n.ID] = true
		parent[n.ID] = n.Parent
		if n.Parent != "" {
			children[n.Parent] = append(children[n.Parent], n.ID)
		}
	}
	if !known[target] {
		return nil, fmt.Errorf("run target %q is not a node in this graph", target)
	}

	// Promote before walking edges, not after: the edges that matter are the
	// container's, and a child's own edges never leave the loop body. seen only
	// matters for a parent cycle — Validate rejects one, but checkRefs does not.
	root := target
	seen := map[NodeID]bool{root: true}
	for p := parent[root]; p != "" && !seen[p]; p = parent[root] {
		seen[p] = true
		root = p
	}

	set := map[NodeID]bool{root: true}
	queue := []NodeID{root}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		for _, e := range g.Edges {
			if (scope == ScopeUpstream || scope == ScopeComponent) && e.To == id && !set[e.From] {
				set[e.From] = true
				queue = append(queue, e.From)
			}
			if (scope == ScopeDownstream || scope == ScopeComponent) && e.From == id && !set[e.To] {
				set[e.To] = true
				queue = append(queue, e.To)
			}
		}
	}

	// Close under containment in both directions. Running to a fixpoint rather
	// than expanding once keeps the answer right for a graph Validate would
	// reject, where an edge crossed a for boundary and pulled a child in.
	work := make([]NodeID, 0, len(set))
	for id := range set {
		work = append(work, id)
	}
	add := func(id NodeID) {
		if id != "" && !set[id] {
			set[id] = true
			work = append(work, id)
		}
	}
	for len(work) > 0 {
		id := work[len(work)-1]
		work = work[:len(work)-1]
		for _, child := range children[id] {
			add(child)
		}
		add(parent[id])
	}
	return set, nil
}

// checkRefs verifies the graph's global structural invariants: unique node
// IDs, edge endpoints that exist, and parents that exist. These checks stay
// global — scopes only partition ordering, not identity.
func (g *Graph) checkRefs() error {
	ids := make(map[NodeID]bool, len(g.Nodes))
	for _, n := range g.Nodes {
		if ids[n.ID] {
			return fmt.Errorf("duplicate node id %q", n.ID)
		}
		ids[n.ID] = true
	}
	for _, e := range g.Edges {
		if !ids[e.From] {
			return fmt.Errorf("edge references unknown node %q", e.From)
		}
		if !ids[e.To] {
			return fmt.Errorf("edge references unknown node %q", e.To)
		}
	}
	for _, n := range g.Nodes {
		if n.Parent != "" && !ids[n.Parent] {
			return fmt.Errorf("node %q: parent references unknown node %q", n.ID, n.Parent)
		}
	}
	return nil
}

// scopeOrder runs Kahn's algorithm over one containment scope: the nodes
// whose Parent is exactly parent ("" = top level), with only the edges whose
// endpoints are both in that scope.
func (g *Graph) scopeOrder(parent NodeID) ([]NodeID, error) {
	index := make(map[NodeID]int, len(g.Nodes))
	var scoped []Node
	for _, n := range g.Nodes {
		if n.Parent != parent {
			continue
		}
		index[n.ID] = len(scoped)
		scoped = append(scoped, n)
	}

	indegree := make([]int, len(scoped))
	dependents := make([][]int, len(scoped))
	for _, e := range g.Edges {
		from, okFrom := index[e.From]
		to, okTo := index[e.To]
		if !okFrom || !okTo {
			continue
		}
		dependents[from] = append(dependents[from], to)
		indegree[to]++
	}

	var ready []int
	for i := range scoped {
		if indegree[i] == 0 {
			ready = append(ready, i)
		}
	}

	order := make([]NodeID, 0, len(scoped))
	for len(ready) > 0 {
		// Pick the lowest declaration index for a deterministic order.
		min := 0
		for i, candidate := range ready {
			if candidate < ready[min] {
				min = i
			}
		}
		current := ready[min]
		ready = append(ready[:min], ready[min+1:]...)

		order = append(order, scoped[current].ID)
		for _, dep := range dependents[current] {
			indegree[dep]--
			if indegree[dep] == 0 {
				ready = append(ready, dep)
			}
		}
	}

	if len(order) != len(scoped) {
		if parent != "" {
			return nil, fmt.Errorf("for node %q: loop body contains a cycle", parent)
		}
		return nil, fmt.Errorf("graph contains a cycle")
	}
	return order, nil
}
