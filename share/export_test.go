package share

import (
	"bytes"
	"errors"
	"reflect"
	"strings"
	"testing"

	"cascade/store"
)

// newTestProject builds a project with the fixtures every export test needs:
// two environments, one known credential, and a collection whose folder tree
// holds one referenced and one unreferenced request.
func newTestProject(t *testing.T) *store.Project {
	t.Helper()
	manager := store.NewManager(t.TempDir(), nil)
	info, err := manager.CreateProject("Test")
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	p, err := manager.Project(info.ID)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if err := p.SaveEnvironments([]store.Environment{
		{Name: "staging", BaseURL: "https://staging.x.io"},
		{Name: "local", BaseURL: "http://localhost:3000"},
	}); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}
	if err := p.SaveCredentials([]store.Credential{
		{Name: "staging-admin", Kind: "bearer"},
	}); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}
	if err := p.SaveCollection(store.Collection{
		ID:   "col1",
		Name: "Demo API",
		Root: store.CollectionFolder{
			ID:   "rootf",
			Name: "",
			Folders: []store.CollectionFolder{{
				ID:   "f1",
				Name: "Users",
				Requests: []store.RequestDef{
					{ID: "req1", Name: "Create user", Protocol: "http", Method: "POST", URL: "/v1/users"},
					{ID: "req2", Name: "List users", Protocol: "http", Method: "GET", URL: "/v1/users"},
				},
			}},
		},
	}); err != nil {
		t.Fatalf("SaveCollection: %v", err)
	}
	return p
}

// testBoard is a three-node chain n1 -> n2 -> n3 with every reference shape:
// a plain literal, a structured binding, a template, and the res sugar.
func testBoard() store.Board {
	return store.Board{
		ID:   "b1",
		Name: "Signup chain",
		Nodes: []store.BoardNode{
			{ID: "n1", Type: "http", Name: "Create User", Data: map[string]any{
				"name": "Create User", "key": "createUser", "method": "POST", "path": "/v1/users",
				"environment": "staging", "credential": "staging-admin",
				"status": "success", "note": "201 in 120ms", "repeat": 1,
				"fields": []any{
					map[string]any{"key": "body.email", "source": "literal", "value": "a@b.c"},
				},
				"requestRef": map[string]any{"collectionId": "col1", "requestId": "req1"},
			}},
			{ID: "n2", Type: "http", Name: "Create Invoice", Data: map[string]any{
				"name": "Create Invoice", "key": "createInvoice", "method": "POST", "path": "/v1/invoices",
				"environment": "local", "credential": "ghost-cred",
				"status": "idle", "repeat": 1,
				"fields": []any{
					map[string]any{
						"key": "body.userId", "source": "binding", "value": "createUser.body.id",
						"ref": map[string]any{"nodeId": "n1", "path": "body.id"},
					},
					map[string]any{
						"key": "body.email", "source": "template",
						"value": "member+{{n1.body.id}}-{{i}}@x.io",
					},
				},
			}},
			{ID: "n3", Type: "http", Name: "Get Invoice", Data: map[string]any{
				"name": "Get Invoice", "key": "getInvoice", "method": "GET", "path": "/v1/invoices/{id}",
				"environment": "staging", "credential": "",
				"status": "error", "note": "boom", "repeat": 1,
				"fields": []any{
					map[string]any{
						"key": "path.id", "source": "binding", "value": "res.body.id",
						"ref": map[string]any{"nodeId": "", "path": "body.id"},
					},
				},
			}},
		},
		Edges: []store.BoardEdge{
			{ID: "e1", From: "n1", To: "n2"},
			{ID: "e2", From: "n2", To: "n3"},
		},
		Layout: store.BoardLayout{
			Positions: map[string]store.Position{
				"n1": {X: 0, Y: 0}, "n2": {X: 300, Y: 40}, "n3": {X: 600, Y: 80},
			},
			Viewport: &store.Viewport{X: 12, Y: 34, Zoom: 1.5},
			Responses: map[string]store.CapturedResponse{
				"n1": {Status: 201, Body: map[string]any{"id": "u_1"}, At: "2026-07-06T14:02:00Z"},
			},
		},
	}
}

func exportedBoard(t *testing.T, raw []byte) Payload {
	t.Helper()
	env, err := Parse(raw)
	if err != nil {
		t.Fatalf("Parse of own export: %v", err)
	}
	return env.Cascade
}

func nodeByID(t *testing.T, nodes []store.BoardNode, id string) store.BoardNode {
	t.Helper()
	for _, n := range nodes {
		if n.ID == id {
			return n
		}
	}
	t.Fatalf("node %q not in export", id)
	return store.BoardNode{}
}

func TestExportBoard(t *testing.T) {
	p := newTestProject(t)
	if err := p.SaveBoard(testBoard()); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}
	raw, err := ExportBoard(p, "b1")
	if err != nil {
		t.Fatalf("ExportBoard: %v", err)
	}
	payload := exportedBoard(t, raw)

	if payload.Kind != KindBoard || payload.FormatVersion != EnvelopeFormatVersion {
		t.Errorf("kind %q version %d", payload.Kind, payload.FormatVersion)
	}
	if payload.Board.ID != "b1" || payload.Board.Name != "Signup chain" || len(payload.Board.Nodes) != 3 {
		t.Errorf("board identity/nodes = %q %q %d", payload.Board.ID, payload.Board.Name, len(payload.Board.Nodes))
	}

	// Requirements: sorted names; the known credential carries its kind as a
	// mapping hint, the dangling one exports with none.
	wantEnvs := []string{"local", "staging"}
	if len(payload.Requires.Environments) != 2 ||
		payload.Requires.Environments[0] != wantEnvs[0] || payload.Requires.Environments[1] != wantEnvs[1] {
		t.Errorf("requires.environments = %v", payload.Requires.Environments)
	}
	wantCreds := []CredentialRequirement{{Name: "ghost-cred"}, {Name: "staging-admin", Kind: "bearer"}}
	if len(payload.Requires.Credentials) != 2 ||
		payload.Requires.Credentials[0] != wantCreds[0] || payload.Requires.Credentials[1] != wantCreds[1] {
		t.Errorf("requires.credentials = %v", payload.Requires.Credentials)
	}

	// Embedded collections: trimmed to the referenced request, flattened.
	if len(payload.Collections) != 1 || payload.Collections[0].ID != "col1" {
		t.Fatalf("collections = %+v", payload.Collections)
	}
	requests := payload.Collections[0].Root.Requests
	if len(requests) != 1 || requests[0].ID != "req1" {
		t.Errorf("embedded requests = %+v", requests)
	}

	// Run state is reset and run data does not travel.
	n1 := nodeByID(t, payload.Board.Nodes, "n1")
	if n1.Data["status"] != "idle" {
		t.Errorf("n1 status = %v, want idle", n1.Data["status"])
	}
	if _, hasNote := n1.Data["note"]; hasNote {
		t.Error("n1 note survived export")
	}
	if payload.Board.Layout.Viewport != nil || payload.Board.Layout.Responses != nil {
		t.Error("viewport/responses survived export")
	}
	if strings.Contains(string(raw), "u_1") {
		t.Error("captured response body leaked into the export")
	}

	// Whole-board export: in-selection bindings stay bound.
	n2 := nodeByID(t, payload.Board.Nodes, "n2")
	rows := n2.Data["fields"].([]any)
	binding := rows[0].(map[string]any)
	if binding["source"] != "binding" || binding["ref"] == nil {
		t.Errorf("in-board binding was rewritten: %v", binding)
	}
}

func TestExportDeterminism(t *testing.T) {
	p := newTestProject(t)
	if err := p.SaveBoard(testBoard()); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}
	first, err := ExportBoard(p, "b1")
	if err != nil {
		t.Fatalf("ExportBoard: %v", err)
	}
	second, err := ExportBoard(p, "b1")
	if err != nil {
		t.Fatalf("ExportBoard: %v", err)
	}
	if !bytes.Equal(first, second) {
		t.Error("two exports of the same board differ")
	}
	// Parse → marshal is byte-stable too: the wire form IS the canonical form.
	env, err := Parse(first)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	again, err := marshal(env)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !bytes.Equal(first, again) {
		t.Error("parse → marshal round trip changed bytes")
	}
	if bytes.Contains(first, []byte("\r")) {
		t.Error("export contains CR — line endings must be LF")
	}
}

func TestExportSelection(t *testing.T) {
	p := newTestProject(t)
	raw, err := ExportSelection(p, testBoard(), []string{"n2", "n3"})
	if err != nil {
		t.Fatalf("ExportSelection: %v", err)
	}
	payload := exportedBoard(t, raw)

	if payload.Kind != KindSelection {
		t.Errorf("kind = %q", payload.Kind)
	}
	if payload.Board.ID != "" || payload.Board.Name != "" {
		t.Errorf("a selection has no board identity, got %q %q", payload.Board.ID, payload.Board.Name)
	}
	if len(payload.Board.Nodes) != 2 {
		t.Fatalf("nodes = %d, want 2", len(payload.Board.Nodes))
	}
	// Only the n2→n3 edge is between selected nodes.
	if len(payload.Board.Edges) != 1 || payload.Board.Edges[0].From != "n2" {
		t.Errorf("edges = %+v", payload.Board.Edges)
	}
	if len(payload.Board.Layout.Positions) != 2 {
		t.Errorf("positions = %v", payload.Board.Layout.Positions)
	}

	// The binding into unselected n1 is exported unbound, flagged with the
	// upstream's KEY so the receiver can re-bind.
	n2 := nodeByID(t, payload.Board.Nodes, "n2")
	rows := n2.Data["fields"].([]any)
	unbound := rows[0].(map[string]any)
	if unbound["source"] != "literal" || unbound["value"] != "" || unbound["ref"] != nil {
		t.Errorf("external binding not unbound: %v", unbound)
	}
	dangling, _ := unbound["dangling"].(map[string]any)
	if dangling["originalKey"] != "createUser" || dangling["path"] != "body.id" {
		t.Errorf("dangling marker = %v", dangling)
	}

	// The template's external {{n1...}} token is rewritten to the upstream's
	// key (unresolvable → surfaces as invalid, never silently rebinds);
	// {{i}} is not a node reference and stays.
	template := rows[1].(map[string]any)
	if template["value"] != "member+{{createUser.body.id}}-{{i}}@x.io" {
		t.Errorf("template value = %v", template["value"])
	}
	if template["dangling"] == nil {
		t.Error("external template reference not flagged dangling")
	}

	// n3's res sugar points at n2, which IS selected — it stays bound.
	n3 := nodeByID(t, payload.Board.Nodes, "n3")
	res := n3.Data["fields"].([]any)[0].(map[string]any)
	if res["source"] != "binding" || res["dangling"] != nil {
		t.Errorf("in-selection res binding was rewritten: %v", res)
	}

	// A selection without the requestRef node embeds no collections.
	if payload.Collections != nil {
		t.Errorf("collections = %+v, want none", payload.Collections)
	}
}

func TestExportSelectionResSugarDangles(t *testing.T) {
	p := newTestProject(t)
	// Select only n3: its res binding's upstream (n2) is outside the selection.
	raw, err := ExportSelection(p, testBoard(), []string{"n3"})
	if err != nil {
		t.Fatalf("ExportSelection: %v", err)
	}
	payload := exportedBoard(t, raw)
	n3 := nodeByID(t, payload.Board.Nodes, "n3")
	res := n3.Data["fields"].([]any)[0].(map[string]any)
	if res["source"] != "literal" {
		t.Errorf("res binding to unselected upstream not unbound: %v", res)
	}
	dangling, _ := res["dangling"].(map[string]any)
	if dangling["originalKey"] != "createInvoice" || dangling["path"] != "body.id" {
		t.Errorf("dangling marker = %v", dangling)
	}
}

// loopBoard is a For container with two children, the shape a selection can
// cut through: containment travels only when the container travels with it.
func loopBoard() store.Board {
	return store.Board{
		ID:   "b2",
		Name: "Signup loop",
		Nodes: []store.BoardNode{
			{ID: "each", Type: "for", Name: "For each seed", Data: map[string]any{
				"name": "For each seed", "key": "eachSeed", "mode": "each", "source": "seed.body",
			}},
			{ID: "child1", Type: "http", Name: "Create User", Parent: "each", Data: map[string]any{
				"name": "Create User", "key": "createUser", "method": "POST", "path": "/v1/users",
				"environment": "staging",
			}},
			{ID: "child2", Type: "http", Name: "Create Org", Parent: "each", Data: map[string]any{
				"name": "Create Org", "key": "createOrg", "method": "POST", "path": "/v1/orgs",
				"environment": "staging",
			}},
		},
		Edges: []store.BoardEdge{{ID: "e1", From: "child1", To: "child2"}},
		Layout: store.BoardLayout{
			Positions: map[string]store.Position{
				"each": {X: 0, Y: 0}, "child1": {X: 40, Y: 60}, "child2": {X: 340, Y: 60},
			},
			Sizes: map[string]store.Size{"each": {Width: 720, Height: 260}},
		},
	}
}

func TestExportSelectionKeepsContainmentAndSizes(t *testing.T) {
	p := newTestProject(t)
	raw, err := ExportSelection(p, loopBoard(), []string{"each", "child1", "child2"})
	if err != nil {
		t.Fatalf("ExportSelection: %v", err)
	}
	payload := exportedBoard(t, raw)

	for _, id := range []string{"child1", "child2"} {
		if parent := nodeByID(t, payload.Board.Nodes, id).Parent; parent != "each" {
			t.Errorf("node %q parent = %q, want %q", id, parent, "each")
		}
	}
	want := map[string]store.Size{"each": {Width: 720, Height: 260}}
	if !reflect.DeepEqual(payload.Board.Layout.Sizes, want) {
		t.Errorf("layout.sizes = %+v, want %+v", payload.Board.Layout.Sizes, want)
	}
}

// TestExportSelectionDropsCutParent is the guard on the field that import
// validates: a child exported without its For must arrive top level, because
// a parent naming an absent node is rejected outright. Asserting the empty
// field is not enough — the envelope has to actually import.
func TestExportSelectionDropsCutParent(t *testing.T) {
	p := newTestProject(t)
	raw, err := ExportSelection(p, loopBoard(), []string{"child1", "child2"})
	if err != nil {
		t.Fatalf("ExportSelection: %v", err)
	}
	payload := exportedBoard(t, raw)

	for _, id := range []string{"child1", "child2"} {
		if parent := nodeByID(t, payload.Board.Nodes, id).Parent; parent != "" {
			t.Errorf("node %q kept parent %q although the For was cut", id, parent)
		}
	}
	if len(payload.Board.Layout.Sizes) != 0 {
		t.Errorf("size of the cut For travelled: %+v", payload.Board.Layout.Sizes)
	}
	if _, _, err := ImportBoard(p, raw); err != nil {
		t.Fatalf("ImportBoard of a cut-child selection: %v", err)
	}
}

func TestExportSelectionErrors(t *testing.T) {
	p := newTestProject(t)
	if _, err := ExportSelection(p, testBoard(), nil); err == nil {
		t.Error("empty selection accepted")
	}
	if _, err := ExportSelection(p, testBoard(), []string{"nope"}); err == nil {
		t.Error("selection of unknown ids accepted")
	}
}

func TestExportNeverContainsSecretValues(t *testing.T) {
	root := t.TempDir()
	secrets, err := store.NewFileSecretStore(root)
	if err != nil {
		t.Fatalf("NewFileSecretStore: %v", err)
	}
	manager := store.NewManager(root, secrets)
	info, err := manager.CreateProject("Test")
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	p, err := manager.Project(info.ID)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if err := p.SaveCredentials([]store.Credential{{Name: "staging-admin", Kind: "bearer"}}); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}
	const secret = "s3cret-t0ken-never-exported"
	if err := secrets.SetSecret(info.ID, "staging-admin", secret); err != nil {
		t.Fatalf("SetSecret: %v", err)
	}
	if err := p.SaveBoard(testBoard()); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}
	raw, err := ExportBoard(p, "b1")
	if err != nil {
		t.Fatalf("ExportBoard: %v", err)
	}
	if strings.Contains(string(raw), secret) {
		t.Error("export contains a stored secret value")
	}
}

func TestParseGates(t *testing.T) {
	if _, err := Parse([]byte("hello, want my chain?")); !errors.Is(err, ErrNotEnvelope) {
		t.Errorf("plain text: err = %v, want ErrNotEnvelope", err)
	}
	if _, err := Parse([]byte(`{"foo": 1}`)); !errors.Is(err, ErrNotEnvelope) {
		t.Errorf("foreign JSON: err = %v, want ErrNotEnvelope", err)
	}
	if _, err := Parse([]byte(`{"cascade": 42}`)); err == nil || errors.Is(err, ErrNotEnvelope) {
		t.Errorf("malformed payload: err = %v, want a loud malformed error", err)
	}
	newer := []byte(`{"cascade": {"kind": "board", "formatVersion": 2, "board": {}}}`)
	if _, err := Parse(newer); err == nil || !strings.Contains(err.Error(), "newer") {
		t.Errorf("newer version: err = %v, want a newer-Cascade explanation", err)
	}
	unknownKind := []byte(`{"cascade": {"kind": "sticker", "formatVersion": 1, "board": {}}}`)
	if _, err := Parse(unknownKind); err == nil || !strings.Contains(err.Error(), "kind") {
		t.Errorf("unknown kind: err = %v, want an unknown-kind error", err)
	}
}
