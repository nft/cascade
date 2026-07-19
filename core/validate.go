package core

import "fmt"

// Validate checks that the graph is a well-formed DAG (reusing the
// ExecutionOrder checks: unique IDs, known edge/parent endpoints, no cycles
// in any scope) and that shape rules hold:
//
//   - note nodes take no edges in either direction — they are annotations,
//     not steps, and have no output to bind;
//   - transform nodes require at least one upstream, since they only reshape
//     upstream data — except inside a for node, where the loop scope
//     ({{item}}, {{i}}, loop ancestors) feeds them without an edge;
//   - containment (plan 09): a parent must be a for node; only http,
//     transform, mock, and delay nodes may be children; no edge may cross a
//     For boundary — the For node is the loop's single interface.
//
// Node config (mock body parses, delay/count in range, non-empty loop) is
// deliberately not checked here: config problems fail only that node at
// dispatch, never the whole run.
func (g *Graph) Validate() error {
	if _, err := g.ExecutionOrder(); err != nil {
		return err
	}

	types := make(map[NodeID]NodeType, len(g.Nodes))
	for _, n := range g.Nodes {
		t := n.EffectiveType()
		if !t.valid() {
			return fmt.Errorf("node %q: unknown node type %q", n.ID, n.Type)
		}
		types[n.ID] = t
	}

	parents := make(map[NodeID]NodeID, len(g.Nodes))
	for _, n := range g.Nodes {
		parents[n.ID] = n.Parent
		if n.Parent == "" {
			continue
		}
		if types[n.Parent] != NodeTypeFor {
			return fmt.Errorf("node %q: parent %q is not a for node", n.ID, n.Parent)
		}
		switch types[n.ID] {
		case NodeTypeHTTP, NodeTypeTransform, NodeTypeMock, NodeTypeDelay:
			// allowed loop-body types
		case NodeTypeFor:
			return fmt.Errorf("node %q: nested for nodes are not supported in v1", n.ID)
		default:
			return fmt.Errorf("node %q: %s nodes cannot be children of a for node", n.ID, types[n.ID])
		}
	}

	indegree := make(map[NodeID]int, len(g.Nodes))
	for _, e := range g.Edges {
		if types[e.To] == NodeTypeNote {
			return fmt.Errorf("edge %q -> %q: note nodes cannot have incoming edges", e.From, e.To)
		}
		if types[e.From] == NodeTypeNote {
			return fmt.Errorf("edge %q -> %q: note nodes cannot have outgoing edges", e.From, e.To)
		}
		// The For node is the loop's single interface: edges between two
		// children of the same For are the loop body's own DAG, edges wholly
		// outside are fine, and anything crossing the boundary (including
		// child ↔ its own For node) is scope leakage.
		if parents[e.From] != parents[e.To] {
			return fmt.Errorf("edge %q -> %q: edges may not cross a for-node boundary", e.From, e.To)
		}
		indegree[e.To]++
	}

	for _, n := range g.Nodes {
		if types[n.ID] == NodeTypeTransform && indegree[n.ID] == 0 && n.Parent == "" {
			return fmt.Errorf("transform node %q requires at least one upstream node", n.ID)
		}
	}
	return nil
}
