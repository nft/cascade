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
			name: "unknown type is rejected",
			graph: Graph{
				Nodes: []Node{{ID: "a", Type: "delay"}},
			},
			wantErr: "unknown node type",
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
