package core

import "fmt"

// Validate checks that the graph is a well-formed DAG (reusing the
// ExecutionOrder checks: unique IDs, known edge endpoints, no cycles) and
// that per-type edge rules hold:
//
//   - note nodes take no edges in either direction — they are annotations,
//     not steps, and have no output to bind;
//   - transform nodes require at least one upstream, since they only reshape
//     upstream data.
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

	indegree := make(map[NodeID]int, len(g.Nodes))
	for _, e := range g.Edges {
		if types[e.To] == NodeTypeNote {
			return fmt.Errorf("edge %q -> %q: note nodes cannot have incoming edges", e.From, e.To)
		}
		if types[e.From] == NodeTypeNote {
			return fmt.Errorf("edge %q -> %q: note nodes cannot have outgoing edges", e.From, e.To)
		}
		indegree[e.To]++
	}

	for _, n := range g.Nodes {
		if types[n.ID] == NodeTypeTransform && indegree[n.ID] == 0 {
			return fmt.Errorf("transform node %q requires at least one upstream node", n.ID)
		}
	}
	return nil
}
