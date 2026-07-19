package core

import (
	"strings"
	"testing"
)

func TestValidate(t *testing.T) {
	tests := []struct {
		name    string
		graph   Graph
		wantErr string // substring of the expected error; empty means valid
	}{
		{
			name: "http chain is valid",
			graph: Graph{
				Nodes: []Node{{ID: "a", Type: NodeTypeHTTP}, {ID: "b", Type: NodeTypeHTTP}},
				Edges: []Edge{{From: "a", To: "b"}},
			},
		},
		{
			name: "zero-value type is treated as http",
			graph: Graph{
				Nodes: []Node{{ID: "a"}, {ID: "t", Type: NodeTypeTransform}},
				Edges: []Edge{{From: "a", To: "t"}},
			},
		},
		{
			name:  "isolated note is valid",
			graph: Graph{Nodes: []Node{{ID: "a", Type: NodeTypeHTTP}, {ID: "memo", Type: NodeTypeNote}}},
		},
		{
			name: "edge into note is rejected",
			graph: Graph{
				Nodes: []Node{{ID: "a", Type: NodeTypeHTTP}, {ID: "memo", Type: NodeTypeNote}},
				Edges: []Edge{{From: "a", To: "memo"}},
			},
			wantErr: "incoming",
		},
		{
			name: "edge out of note is rejected",
			graph: Graph{
				Nodes: []Node{{ID: "memo", Type: NodeTypeNote}, {ID: "a", Type: NodeTypeHTTP}},
				Edges: []Edge{{From: "memo", To: "a"}},
			},
			wantErr: "outgoing",
		},
		{
			name: "transform with an upstream is valid",
			graph: Graph{
				Nodes: []Node{{ID: "a", Type: NodeTypeHTTP}, {ID: "t", Type: NodeTypeTransform}, {ID: "b", Type: NodeTypeHTTP}},
				Edges: []Edge{{From: "a", To: "t"}, {From: "t", To: "b"}},
			},
		},
		{
			name: "transform without an upstream is rejected",
			graph: Graph{
				Nodes: []Node{{ID: "t", Type: NodeTypeTransform}, {ID: "b", Type: NodeTypeHTTP}},
				Edges: []Edge{{From: "t", To: "b"}},
			},
			wantErr: "at least one upstream",
		},
		{
			// Loop scope ({{item}}, {{i}}, loop ancestors) feeds a child
			// transform without an edge (plan 09 N4).
			name: "transform child of a for needs no upstream",
			graph: Graph{
				Nodes: []Node{{ID: "loop", Type: NodeTypeFor}, {ID: "t", Type: NodeTypeTransform, Parent: "loop"}},
			},
		},
		{
			name: "unknown type is rejected",
			graph: Graph{
				Nodes: []Node{{ID: "a", Type: "webhook"}},
			},
			wantErr: "unknown node type",
		},
		{
			name: "mock and delay in a chain are valid",
			graph: Graph{
				Nodes: []Node{{ID: "fixture", Type: NodeTypeMock}, {ID: "wait", Type: NodeTypeDelay}, {ID: "b", Type: NodeTypeHTTP}},
				Edges: []Edge{{From: "fixture", To: "wait"}, {From: "wait", To: "b"}},
			},
		},
		{
			name: "for with allowed children and outside edge into the for is valid",
			graph: Graph{
				Nodes: []Node{
					{ID: "src", Type: NodeTypeHTTP},
					{ID: "loop", Type: NodeTypeFor},
					{ID: "c1", Type: NodeTypeHTTP, Parent: "loop"},
					{ID: "c2", Type: NodeTypeTransform, Parent: "loop"},
					{ID: "sink", Type: NodeTypeHTTP},
				},
				Edges: []Edge{{From: "src", To: "loop"}, {From: "c1", To: "c2"}, {From: "loop", To: "sink"}},
			},
		},
		{
			// A freshly inserted container the user is still dragging nodes
			// into: empty-loop failure is config-tier, not a shape error.
			name:  "empty for is valid at the shape tier",
			graph: Graph{Nodes: []Node{{ID: "loop", Type: NodeTypeFor}}},
		},
		{
			name: "edge from outside into a child is rejected",
			graph: Graph{
				Nodes: []Node{
					{ID: "src", Type: NodeTypeHTTP},
					{ID: "loop", Type: NodeTypeFor},
					{ID: "c1", Type: NodeTypeHTTP, Parent: "loop"},
				},
				Edges: []Edge{{From: "src", To: "c1"}},
			},
			wantErr: "cross a for-node boundary",
		},
		{
			name: "edge from a child to outside is rejected",
			graph: Graph{
				Nodes: []Node{
					{ID: "loop", Type: NodeTypeFor},
					{ID: "c1", Type: NodeTypeHTTP, Parent: "loop"},
					{ID: "sink", Type: NodeTypeHTTP},
				},
				Edges: []Edge{{From: "c1", To: "sink"}},
			},
			wantErr: "cross a for-node boundary",
		},
		{
			name: "edge between a child and its own for node is rejected",
			graph: Graph{
				Nodes: []Node{
					{ID: "loop", Type: NodeTypeFor},
					{ID: "c1", Type: NodeTypeHTTP, Parent: "loop"},
				},
				Edges: []Edge{{From: "loop", To: "c1"}},
			},
			wantErr: "cross a for-node boundary",
		},
		{
			name: "note as a child is rejected",
			graph: Graph{
				Nodes: []Node{
					{ID: "loop", Type: NodeTypeFor},
					{ID: "memo", Type: NodeTypeNote, Parent: "loop"},
				},
			},
			wantErr: "cannot be children",
		},
		{
			name: "nested for is rejected",
			graph: Graph{
				Nodes: []Node{
					{ID: "outer", Type: NodeTypeFor},
					{ID: "inner", Type: NodeTypeFor, Parent: "outer"},
				},
			},
			wantErr: "nested for",
		},
		{
			name: "parent that is not a for node is rejected",
			graph: Graph{
				Nodes: []Node{
					{ID: "a", Type: NodeTypeHTTP},
					{ID: "b", Type: NodeTypeHTTP, Parent: "a"},
				},
			},
			wantErr: "not a for node",
		},
		{
			name: "cycle is rejected",
			graph: Graph{
				Nodes: []Node{{ID: "a", Type: NodeTypeHTTP}, {ID: "b", Type: NodeTypeHTTP}},
				Edges: []Edge{{From: "a", To: "b"}, {From: "b", To: "a"}},
			},
			wantErr: "cycle",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.graph.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() error = %v, want nil", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("Validate() = nil, want error containing %q", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Errorf("Validate() error = %q, want it to contain %q", err, tt.wantErr)
			}
		})
	}
}
