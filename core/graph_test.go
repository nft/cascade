package core

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
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

// closureVectors is the fixture shared with frontend/src/lib/graph.test.ts, so
// the engine's run set and the canvas pre-flight cannot drift apart unnoticed.
type closureVectors struct {
	Graphs map[string]struct {
		Nodes []Node `json:"nodes"`
		Edges []Edge `json:"edges"`
	} `json:"graphs"`
	Cases []struct {
		Note   string   `json:"note"`
		Graph  string   `json:"graph"`
		Target NodeID   `json:"target"`
		Scope  Scope    `json:"scope"`
		Expect []NodeID `json:"expect"`
	} `json:"cases"`
}

func TestClosureVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/closure_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var vectors closureVectors
	if err := json.Unmarshal(raw, &vectors); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(vectors.Cases) == 0 {
		t.Fatal("no cases in the fixture")
	}
	for _, tc := range vectors.Cases {
		name := fmt.Sprintf("%s/%s/%s", tc.Graph, tc.Target, tc.Scope)
		t.Run(name, func(t *testing.T) {
			src, ok := vectors.Graphs[tc.Graph]
			if !ok {
				t.Fatalf("unknown graph %q", tc.Graph)
			}
			g := &Graph{Nodes: src.Nodes, Edges: src.Edges}
			// Every fixture graph is one a user could build, so the closure is
			// never asked about a shape the editor would have rejected.
			if err := g.Validate(); err != nil {
				t.Fatalf("fixture graph %q is invalid: %v", tc.Graph, err)
			}
			set, err := g.Closure(tc.Target, tc.Scope)
			if err != nil {
				t.Fatalf("Closure: %v", err)
			}
			got := make([]NodeID, 0, len(set))
			for id := range set {
				got = append(got, id)
			}
			slices.Sort(got)
			if !reflect.DeepEqual(got, tc.Expect) {
				t.Errorf("got %v, want %v", got, tc.Expect)
			}
		})
	}
}

func TestClosureStopsAtAParentCycle(t *testing.T) {
	g := &Graph{Nodes: []Node{{ID: "a", Parent: "b"}, {ID: "b", Parent: "a"}}}
	set, err := g.Closure("a", ScopeUpstream)
	if err != nil {
		t.Fatalf("Closure: %v", err)
	}
	if !reflect.DeepEqual(set, map[NodeID]bool{"a": true, "b": true}) {
		t.Errorf("got %v, want a and b", set)
	}
}

func TestClosureRejects(t *testing.T) {
	g := &Graph{Nodes: []Node{{ID: "a"}, {ID: "b"}}, Edges: []Edge{{From: "a", To: "b"}}}
	if _, err := g.Closure("a", "sideways"); err == nil {
		t.Error("Closure() = nil, want an unknown-scope error")
	}
	if _, err := g.Closure("ghost", ScopeUpstream); err == nil {
		t.Error("Closure() = nil, want an unknown-target error")
	}
}
