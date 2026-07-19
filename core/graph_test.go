package core

import (
	"slices"
	"testing"
)

func graphOf(nodeIDs []NodeID, edges []Edge) *Graph {
	nodes := make([]Node, len(nodeIDs))
	for i, id := range nodeIDs {
		nodes[i] = Node{ID: id}
	}
	return &Graph{Nodes: nodes, Edges: edges}
}

func TestExecutionOrderLinearChain(t *testing.T) {
	g := graphOf(
		[]NodeID{"create-user", "create-org", "create-project"},
		[]Edge{
			{From: "create-user", To: "create-org"},
			{From: "create-org", To: "create-project"},
		},
	)

	order, err := g.ExecutionOrder()
	if err != nil {
		t.Fatalf("ExecutionOrder() error = %v", err)
	}
	want := []NodeID{"create-user", "create-org", "create-project"}
	if !slices.Equal(order, want) {
		t.Errorf("ExecutionOrder() = %v, want %v", order, want)
	}
}

func TestExecutionOrderIndependentBranchesAreDeterministic(t *testing.T) {
	g := graphOf(
		[]NodeID{"b", "a", "sink"},
		[]Edge{
			{From: "b", To: "sink"},
			{From: "a", To: "sink"},
		},
	)

	// Declaration order breaks the tie between the independent roots.
	want := []NodeID{"b", "a", "sink"}
	for range 10 {
		order, err := g.ExecutionOrder()
		if err != nil {
			t.Fatalf("ExecutionOrder() error = %v", err)
		}
		if !slices.Equal(order, want) {
			t.Fatalf("ExecutionOrder() = %v, want %v", order, want)
		}
	}
}

func TestExecutionOrderRejectsCycle(t *testing.T) {
	g := graphOf(
		[]NodeID{"a", "b"},
		[]Edge{
			{From: "a", To: "b"},
			{From: "b", To: "a"},
		},
	)

	if _, err := g.ExecutionOrder(); err == nil {
		t.Error("ExecutionOrder() expected cycle error, got nil")
	}
}

func TestExecutionOrderRejectsUnknownNode(t *testing.T) {
	g := graphOf(
		[]NodeID{"a"},
		[]Edge{{From: "a", To: "ghost"}},
	)

	if _, err := g.ExecutionOrder(); err == nil {
		t.Error("ExecutionOrder() expected unknown-node error, got nil")
	}
}

func TestExecutionOrderRejectsDuplicateNodeID(t *testing.T) {
	g := graphOf([]NodeID{"a", "a"}, nil)

	if _, err := g.ExecutionOrder(); err == nil {
		t.Error("ExecutionOrder() expected duplicate-id error, got nil")
	}
}

// seedLoopGraph is a top-level chain feeding a For whose body is its own
// small DAG: source → loop{ createUser → sendInvite, audit } → report.
func seedLoopGraph() *Graph {
	return &Graph{
		Nodes: []Node{
			{ID: "source", Type: NodeTypeHTTP},
			{ID: "loop", Type: NodeTypeFor},
			{ID: "createUser", Type: NodeTypeHTTP, Parent: "loop"},
			{ID: "sendInvite", Type: NodeTypeHTTP, Parent: "loop"},
			{ID: "audit", Type: NodeTypeMock, Parent: "loop"},
			{ID: "report", Type: NodeTypeHTTP},
		},
		Edges: []Edge{
			{From: "source", To: "loop"},
			{From: "createUser", To: "sendInvite"},
			{From: "loop", To: "report"},
		},
	}
}

func TestExecutionOrderTreatsForAsSingleVertex(t *testing.T) {
	g := seedLoopGraph()

	order, err := g.ExecutionOrder()
	if err != nil {
		t.Fatalf("ExecutionOrder() error = %v", err)
	}
	// Children are excluded — the For node executes them.
	want := []NodeID{"source", "loop", "report"}
	if !slices.Equal(order, want) {
		t.Errorf("ExecutionOrder() = %v, want %v", order, want)
	}
}

func TestChildExecutionOrderIsDeterministic(t *testing.T) {
	g := seedLoopGraph()

	// createUser and audit are both roots of the loop body; among ready
	// nodes the lowest declaration index runs first, same rule as the top
	// level — so sendInvite (declared before audit) runs as soon as
	// createUser frees it.
	want := []NodeID{"createUser", "sendInvite", "audit"}
	for range 10 {
		order, err := g.ChildExecutionOrder("loop")
		if err != nil {
			t.Fatalf("ChildExecutionOrder() error = %v", err)
		}
		if !slices.Equal(order, want) {
			t.Fatalf("ChildExecutionOrder() = %v, want %v", order, want)
		}
	}
}

func TestExecutionOrderRejectsCycleInsideLoopBody(t *testing.T) {
	g := seedLoopGraph()
	g.Edges = append(g.Edges, Edge{From: "sendInvite", To: "createUser"})

	// The cycle is confined to the loop body, which the top-level order never
	// includes — it must still fail the whole graph.
	if _, err := g.ExecutionOrder(); err == nil {
		t.Error("ExecutionOrder() expected loop-body cycle error, got nil")
	}
}

func TestExecutionOrderRejectsUnknownParent(t *testing.T) {
	g := &Graph{Nodes: []Node{{ID: "a", Type: NodeTypeHTTP, Parent: "ghost"}}}

	if _, err := g.ExecutionOrder(); err == nil {
		t.Error("ExecutionOrder() expected unknown-parent error, got nil")
	}
}
