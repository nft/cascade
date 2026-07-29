package main

// The run event stream's wire shape, pinned as a golden file the frontend
// reads back (testdata/run_wire.json).
//
// Every other DTO on this boundary is covered by the Wails binding generator,
// which writes frontend/wailsjs/go/models.ts from these structs. runEvent is
// not: it travels through EventsEmit, which the generator never sees, so
// nothing but this test connects its json tags to model.ts's RunEvent and
// LogEntry. Renaming a tag here would compile, pass every Go test, and
// silently stop painting the canvas.

import (
	"encoding/json"
	"flag"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"cascade/core"
	"cascade/store"
)

var updateWire = flag.Bool("update", false, "rewrite testdata/run_wire.json from this run")

const (
	wirePath  = "testdata/run_wire.json"
	wireRunID = "run-wire"
	wireBoard = "board-wire"
	// The store mints a fresh project id per temp dir, and httptest a fresh
	// port; both are stand-ins so the golden stays stable.
	wireProject = "project-wire"
	wireOrigin  = "http://api.test"
)

// wireFile is the golden document: one run's whole stream plus its terminal
// result, exactly as the frontend receives them.
type wireFile struct {
	Events []json.RawMessage `json:"events"`
	Result json.RawMessage   `json:"result"`
}

// TestRunWireGolden runs a board that produces every log variant and both
// terminal statuses, then compares the emitted JSON against the golden file.
func TestRunWireGolden(t *testing.T) {
	srv, _ := newJSONServer(map[string]jsonReply{
		"/v1/users":   {status: http.StatusCreated, body: `{"id":"usr_1","name":"Ada"}`},
		"/v1/rejects": {status: http.StatusUnprocessableEntity, body: `{"error":"invalid"}`},
	})
	defer srv.Close()

	app, projectID, _ := newRunApp(t, map[string]string{"local": srv.URL})
	collector, result, err := runBoard(t, app, projectID, RunRequest{
		RunID: wireRunID, BoardID: wireBoard, Board: wireBoardFixture(),
	})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}

	replace := strings.NewReplacer(srv.URL, wireOrigin, projectID, wireProject)
	got := wireFile{Result: marshal(t, normalize(t, result, replace))}
	for _, e := range collector.all() {
		got.Events = append(got.Events, marshal(t, normalize(t, e, replace)))
	}
	document := marshal(t, got)

	if *updateWire {
		if err := os.WriteFile(wirePath, append(document, '\n'), 0o644); err != nil {
			t.Fatalf("write golden: %v", err)
		}
		t.Logf("wrote %s", filepath.Base(wirePath))
		return
	}
	want, err := os.ReadFile(wirePath)
	if err != nil {
		t.Fatalf("read golden (regenerate with `go test . -run TestRunWireGolden -update`): %v", err)
	}
	if strings.TrimSpace(string(want)) != string(document) {
		t.Errorf("the run wire shape changed.\n got: %s\nwant: %s\n\n"+
			"If the change is intended, regenerate with `go test . -run TestRunWireGolden -update` "+
			"and make frontend/src/lib/runWire.test.ts pass against it.", document, want)
	}
}

// wireBoardFixture covers all five log variants, both terminal statuses and a
// skip: a successful call, a loop whose child calls once per iteration with a
// delay between, a mock, a transform reading them, a 422, and a node
// downstream of the 422 that therefore never runs.
func wireBoardFixture() store.Board {
	return store.Board{ID: wireBoard, Nodes: []store.BoardNode{
		httpNodeSpec{
			id: "create-user", key: "createUser", name: "Create User",
			method: http.MethodPost, path: "/v1/users", environment: "local",
			fields: []map[string]any{literalField("body.name", "Ada")},
		}.node(),
		{ID: "loop", Type: string(core.NodeTypeFor), Name: "Repeat", Data: map[string]any{
			"key": "repeat", "mode": "count", "count": 2,
		}},
		{ID: "pause", Type: string(core.NodeTypeDelay), Name: "Pause", Parent: "loop", Data: map[string]any{
			"key": "pause", "durationMs": 1,
		}},
		httpNodeSpec{
			id: "invite", key: "invite", name: "Invite",
			method: http.MethodPost, path: "/v1/invites", environment: "local", parent: "loop",
			fields: []map[string]any{templateField("body.email", "member+{{i}}@example.com")},
		}.node(),
		{ID: "canned", Type: string(core.NodeTypeMock), Name: "Canned", Data: map[string]any{
			"key": "canned", "body": `{"plan":"pro"}`, "statusCode": 201,
		}},
		{ID: "shape", Type: string(core.NodeTypeTransform), Name: "Shape", Data: map[string]any{
			"key": "shape", "mode": "pick",
			"pick": []any{map[string]any{
				"key": "id", "source": "binding",
				"ref": map[string]any{"nodeId": "create-user", "path": "body.id"},
			}},
		}},
		httpNodeSpec{
			id: "rejected", key: "rejected", name: "Rejected",
			method: http.MethodPost, path: "/v1/rejects", environment: "local",
		}.node(),
		httpNodeSpec{
			id: "never", key: "never", name: "Never",
			method: http.MethodGet, path: "/v1/never", environment: "local",
		}.node(),
		{ID: "sticky", Type: string(core.NodeTypeNote), Name: "Sticky", Data: map[string]any{"text": "not scheduled"}},
	}, Edges: []store.BoardEdge{
		{ID: "e1", From: "create-user", To: "shape"},
		{ID: "e2", From: "canned", To: "shape"},
		{ID: "e3", From: "rejected", To: "never"},
	}}
}

// Values that differ on every run. The wire CONTRACT is which keys carry
// what; a clock reading is not part of it, and leaving these in would only
// re-fail the test each run.
var wireVolatile = []struct {
	match *regexp.Regexp
	fixed string
}{
	{regexp.MustCompile(`"time":\s*"[^"]*"`), `"time": "00:00:00.000"`},
	{regexp.MustCompile(`"at":\s*"[^"]*"`), `"at": "2026-01-01T00:00:00.000Z"`},
	{regexp.MustCompile(`"Date":\s*"[^"]*"`), `"Date": "Thu, 01 Jan 2026 00:00:00 GMT"`},
	{regexp.MustCompile(`"durationMs":\s*\d+`), `"durationMs": 0`},
}

func normalize(t *testing.T, v any, replace *strings.Replacer) json.RawMessage {
	t.Helper()
	out := replace.Replace(string(marshal(t, v)))
	for _, rule := range wireVolatile {
		out = rule.match.ReplaceAllString(out, rule.fixed)
	}
	return json.RawMessage(out)
}

func marshal(t *testing.T, v any) []byte {
	t.Helper()
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	return data
}
