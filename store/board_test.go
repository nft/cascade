package store

import (
	"bytes"
	"encoding/json"
	"testing"

	"cascade/core"
)

// loopBoard is a For container holding two children: the shape whose
// containment (node.parent) and container size (layout.sizes) the board
// format has to preserve, since neither is recoverable from anything else.
func loopBoard(id string) Board {
	return Board{
		FormatVersion: BoardFormatVersion,
		ID:            id,
		Name:          "Signup loop",
		Nodes: []BoardNode{
			{ID: "each", Type: "for", Name: "For each seed", Data: map[string]any{
				"key": "eachSeed", "mode": "each", "source": "seed.body",
			}},
			{ID: "create-user", Type: "http", Name: "Create User", Parent: "each", Data: map[string]any{
				"key": "createUser", "method": "POST", "path": "/v1/users",
			}},
			{ID: "create-org", Type: "http", Name: "Create Org", Parent: "each", Data: map[string]any{
				"key": "createOrg", "method": "POST", "path": "/v1/orgs",
			}},
		},
		Edges: []BoardEdge{{ID: "e1", From: "create-user", To: "create-org"}},
		Layout: BoardLayout{
			Positions: map[string]Position{
				"each": {X: 0, Y: 0}, "create-user": {X: 40, Y: 60}, "create-org": {X: 340, Y: 60},
			},
			Sizes: map[string]Size{"each": {Width: 720, Height: 260}},
			Responses: map[string]CapturedResponse{
				"create-user": {
					Status:  201,
					Headers: map[string]string{"Content-Type": "application/json"},
					Body:    map[string]any{"id": "u1"},
					Schema: map[string]any{
						"type":       "object",
						"properties": map[string]any{"id": map[string]any{"type": "string"}},
					},
					At: "2026-07-06T14:02:00Z",
				},
			},
		},
	}
}

func boardNodeByID(t *testing.T, b Board, id string) BoardNode {
	t.Helper()
	for _, n := range b.Nodes {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("node %q not in board", id)
	return BoardNode{}
}

func TestBoardJSONRoundTripKeepsContainmentAndSizes(t *testing.T) {
	first, err := json.Marshal(loopBoard("b1"))
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// Byte identity alone would also hold if both passes dropped the fields,
	// so assert they are on the wire before comparing.
	for _, want := range []string{`"parent":"each"`, `"sizes":{"each":{"width":720,"height":260}}`, `"schema":{`} {
		if !bytes.Contains(first, []byte(want)) {
			t.Fatalf("serialized board is missing %s:\n%s", want, first)
		}
	}

	var decoded Board
	if err := json.Unmarshal(first, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if got := boardNodeByID(t, decoded, "create-user").Parent; got != "each" {
		t.Errorf("decoded parent = %q, want %q", got, "each")
	}
	if got := decoded.Layout.Sizes["each"]; got != (Size{Width: 720, Height: 260}) {
		t.Errorf("decoded size = %+v", got)
	}
	if got := decoded.Layout.Responses["create-user"]; got.Status != 201 || got.At != "2026-07-06T14:02:00Z" {
		t.Errorf("decoded response = %+v", got)
	}

	second, err := json.Marshal(decoded)
	if err != nil {
		t.Fatalf("re-marshal: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Errorf("round trip changed bytes:\n first  %s\n second %s", first, second)
	}
}

// TestBoardJSONOmitsAbsentLayoutSizes pins the omitempty: boards without a For
// must not gain a sizes key, or every existing board file churns on next save.
func TestBoardJSONOmitsAbsentLayoutSizes(t *testing.T) {
	flat := Board{ID: "b1", Nodes: []BoardNode{{ID: "n1"}}, Layout: BoardLayout{
		Positions: map[string]Position{"n1": {}},
	}}
	raw, err := json.Marshal(flat)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if bytes.Contains(raw, []byte(`"sizes"`)) || bytes.Contains(raw, []byte(`"parent"`)) {
		t.Errorf("empty containment/size keys were written:\n%s", raw)
	}
}

func TestBoardGraphCarriesParent(t *testing.T) {
	g := loopBoard("b1").Graph()
	parents := map[core.NodeID]core.NodeID{}
	for _, n := range g.Nodes {
		parents[n.ID] = n.Parent
	}
	want := map[core.NodeID]core.NodeID{"each": "", "create-user": "each", "create-org": "each"}
	for id, wantParent := range want {
		if parents[id] != wantParent {
			t.Errorf("graph node %q parent = %q, want %q", id, parents[id], wantParent)
		}
	}
	if err := g.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
}

// A capture written with response bodies turned off still has to survive the
// store: the schema is what keeps the binding picker working, and a field the
// struct does not declare is dropped silently on the first save.
func TestBodylessCaptureKeepsItsSchema(t *testing.T) {
	board := loopBoard("b1")
	captured := board.Layout.Responses["create-user"]
	captured.Body = nil
	board.Layout.Responses["create-user"] = captured

	data, err := json.Marshal(board)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if bytes.Contains(data, []byte(`"body"`)) {
		t.Errorf("board file still carries a body key:\n%s", data)
	}

	var decoded Board
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	got := decoded.Layout.Responses["create-user"]
	if got.Body != nil {
		t.Errorf("decoded body = %v, want nil", got.Body)
	}
	schema, ok := got.Schema.(map[string]any)
	if !ok {
		t.Fatalf("decoded schema = %+v (%T), want an object", got.Schema, got.Schema)
	}
	if props, _ := schema["properties"].(map[string]any); props["id"] == nil {
		t.Fatalf("decoded schema = %+v, want the id property preserved", schema)
	}
}
