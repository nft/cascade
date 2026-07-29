package exec

import "cascade/core"

// Target restricts a run to one node's subgraph. Nil runs the whole board.
type Target struct {
	Node  core.NodeID
	Scope core.Scope
}

// resolveRunSet returns the node set a run covers, or nil for "everything".
//
// Nil is deliberately not the same as a set holding every node: skipped()
// reads nil as "no filtering", so a whole-board run pays for no lookups and
// cannot accidentally exempt an upstream from the skip cascade.
//
// The set is a filter over the full graph, never a pruned graph. Dropping an
// ancestor would change a node's direct-upstream count and turn a valid `res`
// binding into an ambiguity error.
func resolveRunSet(g *core.Graph, target *Target) (map[core.NodeID]bool, error) {
	if target == nil {
		return nil, nil
	}
	return g.Closure(target.Node, target.Scope)
}

// runNodes lists the executable nodes a run covers, in declaration order, for
// the run.started event. Notes are excluded: they never execute and carry no
// edges, so the canvas has nothing to paint for them.
func runNodes(g *core.Graph, set map[core.NodeID]bool) []core.NodeID {
	ids := make([]core.NodeID, 0, len(g.Nodes))
	for _, n := range g.Nodes {
		if n.EffectiveType() == core.NodeTypeNote {
			continue
		}
		if set == nil || set[n.ID] {
			ids = append(ids, n.ID)
		}
	}
	return ids
}
