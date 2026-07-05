package core

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestUnmarshalLegacyGraphDefaultsNodeTypeToHTTP(t *testing.T) {
	// A board saved before the type discriminator (and formatVersion field)
	// existed must parse unchanged, with every node reading as http.
	legacy := `{
		"nodes": [
			{"id": "create-user", "name": "Create User"},
			{"id": "create-org", "name": "Create Org"}
		],
		"edges": [{"from": "create-user", "to": "create-org"}]
	}`

	var g Graph
	if err := json.Unmarshal([]byte(legacy), &g); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(g.Nodes) != 2 || len(g.Edges) != 1 {
		t.Fatalf("Unmarshal() = %d nodes, %d edges; want 2, 1", len(g.Nodes), len(g.Edges))
	}
	for _, n := range g.Nodes {
		if n.Type != NodeTypeHTTP {
			t.Errorf("node %q Type = %q, want %q", n.ID, n.Type, NodeTypeHTTP)
		}
	}
}

func TestUnmarshalExplicitNodeTypes(t *testing.T) {
	doc := `{
		"formatVersion": 1,
		"nodes": [
			{"id": "a", "type": "http"},
			{"id": "b", "type": "transform"},
			{"id": "c", "type": "note"}
		],
		"edges": []
	}`

	var g Graph
	if err := json.Unmarshal([]byte(doc), &g); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	want := []NodeType{NodeTypeHTTP, NodeTypeTransform, NodeTypeNote}
	for i, n := range g.Nodes {
		if n.Type != want[i] {
			t.Errorf("node %q Type = %q, want %q", n.ID, n.Type, want[i])
		}
	}
}

func TestUnmarshalRejectsUnknownNodeType(t *testing.T) {
	doc := `{"formatVersion": 1, "nodes": [{"id": "a", "type": "delay"}], "edges": []}`

	var g Graph
	err := json.Unmarshal([]byte(doc), &g)
	if err == nil {
		t.Fatal("Unmarshal() expected unknown-type error, got nil")
	}
	if !strings.Contains(err.Error(), "delay") {
		t.Errorf("error %q does not name the offending type", err)
	}
}

func TestUnmarshalRejectsNewerFormatVersion(t *testing.T) {
	doc := `{"formatVersion": 2, "nodes": [], "edges": []}`

	var g Graph
	if err := json.Unmarshal([]byte(doc), &g); err == nil {
		t.Fatal("Unmarshal() expected format-version error, got nil")
	}
}

func TestMarshalWritesExplicitTypeAndVersion(t *testing.T) {
	// The zero-value Type serializes as "http" so output is self-describing.
	g := Graph{Nodes: []Node{{ID: "a", Name: "A"}}}

	data, err := json.Marshal(g)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	s := string(data)
	if !strings.Contains(s, `"type":"http"`) {
		t.Errorf("Marshal() = %s, missing explicit http type", s)
	}
	if !strings.Contains(s, `"formatVersion":1`) {
		t.Errorf("Marshal() = %s, missing formatVersion", s)
	}
	if !strings.Contains(s, `"edges":[]`) {
		t.Errorf("Marshal() = %s, nil edges should serialize as []", s)
	}
}

func TestGraphRoundTrip(t *testing.T) {
	g := Graph{
		Nodes: []Node{
			{ID: "a", Type: NodeTypeHTTP, Name: "A"},
			{ID: "b", Type: NodeTypeTransform, Name: "B"},
			{ID: "c", Type: NodeTypeNote, Name: "C"},
		},
		Edges: []Edge{{From: "a", To: "b"}},
	}

	data, err := json.Marshal(g)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	var got Graph
	if err := json.Unmarshal(data, &got); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if len(got.Nodes) != len(g.Nodes) || len(got.Edges) != len(g.Edges) {
		t.Fatalf("round trip = %+v, want %+v", got, g)
	}
	for i, n := range got.Nodes {
		if n != g.Nodes[i] {
			t.Errorf("node %d = %+v, want %+v", i, n, g.Nodes[i])
		}
	}
}
