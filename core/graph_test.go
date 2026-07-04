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
