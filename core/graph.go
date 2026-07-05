// Package core is Cascade's UI-independent engine: graph model, binding
// resolution, DAG execution, OpenAPI schema import, and log emission.
// It must stay free of Wails (and any UI) dependencies so it can back the
// desktop app, a headless CLI runner, or a server build alike.
package core

import "fmt"

// NodeID uniquely identifies a node within a graph.
type NodeID string

// NodeType discriminates what a node is (plan 06). Only http nodes make
// requests; transform nodes reshape upstream data in-process; note nodes are
// canvas annotations and never execute. The discriminator plus per-type
// executor dispatch is the extension point for future types (delay,
// condition, foreach).
type NodeType string

const (
	NodeTypeHTTP      NodeType = "http"
	NodeTypeTransform NodeType = "transform"
	NodeTypeNote      NodeType = "note"
)

func (t NodeType) valid() bool {
	switch t {
	case NodeTypeHTTP, NodeTypeTransform, NodeTypeNote:
		return true
	}
	return false
}

// Node is a single step in the graph. For http nodes that is one API call
// bound to an environment and a credential. Operation reference, form values,
// bindings, repeat count, and per-node log settings are added as M1+
// progresses.
type Node struct {
	ID   NodeID   `json:"id"`
	Type NodeType `json:"type,omitempty"`
	Name string   `json:"name,omitempty"`
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

// ExecutionOrder returns the node IDs in a valid execution order using
// Kahn's algorithm. Ties are broken by node declaration order, so the result
// is deterministic. It returns an error if an edge references an unknown
// node or the graph contains a cycle.
func (g *Graph) ExecutionOrder() ([]NodeID, error) {
	index := make(map[NodeID]int, len(g.Nodes))
	for i, n := range g.Nodes {
		if _, dup := index[n.ID]; dup {
			return nil, fmt.Errorf("duplicate node id %q", n.ID)
		}
		index[n.ID] = i
	}

	indegree := make([]int, len(g.Nodes))
	dependents := make([][]int, len(g.Nodes))
	for _, e := range g.Edges {
		from, ok := index[e.From]
		if !ok {
			return nil, fmt.Errorf("edge references unknown node %q", e.From)
		}
		to, ok := index[e.To]
		if !ok {
			return nil, fmt.Errorf("edge references unknown node %q", e.To)
		}
		dependents[from] = append(dependents[from], to)
		indegree[to]++
	}

	var ready []int
	for i := range g.Nodes {
		if indegree[i] == 0 {
			ready = append(ready, i)
		}
	}

	order := make([]NodeID, 0, len(g.Nodes))
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

		order = append(order, g.Nodes[current].ID)
		for _, dep := range dependents[current] {
			indegree[dep]--
			if indegree[dep] == 0 {
				ready = append(ready, dep)
			}
		}
	}

	if len(order) != len(g.Nodes) {
		return nil, fmt.Errorf("graph contains a cycle")
	}
	return order, nil
}
