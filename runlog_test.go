package main

import (
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/exec"
	"cascade/core/nodespec"
	"cascade/store"
)

// dtoContext builds a runContext over a board of the given nodes, decoding
// their data the way RunBoard does.
func dtoContext(nodes ...store.BoardNode) runContext {
	board := store.Board{ID: "b1", Nodes: nodes}
	return newRunContext("p1", "b1", board, decodeSpecs(board))
}

func recordEvent(rec exec.Record, output *binding.Output) exec.Event {
	return exec.Event{
		Kind:      exec.EventNodeFinished,
		RunID:     "run-1",
		Node:      rec.Node,
		Iteration: rec.Iteration,
		Status:    exec.StatusSuccess,
		Record:    &rec,
		Output:    output,
	}
}

var logStart = time.Date(2026, 7, 29, 14, 5, 6, 700_000_000, time.UTC)

// Every event carries the (project, board) pair the run started on, which is
// the only key that distinguishes two boards seeded from the same file: their
// node ids are equal by construction.
func TestRunEventCarriesItsScope(t *testing.T) {
	c := dtoContext(store.BoardNode{ID: "a", Type: "mock", Name: "A"})
	for _, kind := range []exec.EventKind{
		exec.EventRunStarted, exec.EventNodeStarted, exec.EventNodeFinished,
		exec.EventLoopProgress, exec.EventRunFinished,
	} {
		got := c.event(exec.Event{Kind: kind, RunID: "run-1"})
		if got.ProjectID != "p1" || got.BoardID != "b1" || got.RunID != "run-1" {
			t.Errorf("%s event scope = %+v", kind, got)
		}
	}
}

// The two run-level kinds name no node, so they must not carry an iteration
// either — the engine's zero value there is meaningless, not iteration 0.
func TestRunLevelEventsCarryNoIteration(t *testing.T) {
	c := dtoContext()
	for _, kind := range []exec.EventKind{exec.EventRunStarted, exec.EventRunFinished} {
		if got := c.event(exec.Event{Kind: kind}); got.Iteration != nil {
			t.Errorf("%s carries iteration %d", kind, *got.Iteration)
		}
	}
	// Outside a loop the engine reports -1, which is an absent field.
	top := c.event(exec.Event{Kind: exec.EventNodeStarted, Node: "a", Iteration: -1})
	if top.Iteration != nil {
		t.Errorf("a top-level node carries iteration %d", *top.Iteration)
	}
	inLoop := c.event(exec.Event{Kind: exec.EventNodeStarted, Node: "a", Iteration: 0})
	if inLoop.Iteration == nil || *inLoop.Iteration != 0 {
		t.Errorf("a loop child's iteration 0 was dropped: %v", inLoop.Iteration)
	}
}

func TestHTTPLogRow(t *testing.T) {
	c := dtoContext(httpNodeSpec{id: "n1", key: "createUser", name: "Create user", method: http.MethodPost, path: "/users"}.node())
	rec := exec.Record{
		Node: "n1", Type: core.NodeTypeHTTP, Time: logStart, Duration: 120 * time.Millisecond,
		Iteration: -1, Status: 201,
		HTTP: &exec.CallDetail{
			Method: http.MethodPost, URL: "https://api.example.com/users",
			RequestBody: `{"name":"Ada"}`, Status: 201, StatusText: "Created",
			ResponseBody: `{"id":"usr_1"}`, DurationMs: 120,
		},
	}
	row := c.event(recordEvent(rec, &binding.Output{Status: 201})).Log
	if row == nil {
		t.Fatal("no log row")
	}
	want := runLogEntry{
		Kind: "http", ID: "run-1-n1", RunID: "run-1", Time: "14:05:06.700",
		Node: "Create user", NodeID: "n1", DurationMs: 120,
		Method: http.MethodPost, URL: "https://api.example.com/users",
		Request: `{"name":"Ada"}`, Response: `{"id":"usr_1"}`,
	}
	status := 201
	want.Status = &status
	if !reflect.DeepEqual(*row, want) {
		t.Errorf("\n got %+v\nwant %+v", *row, want)
	}
}

// A call that never reached a server has no status, and 0 is not a usable
// stand-in — the row would classify as a success in the panel's filter.
func TestHTTPLogRowOmitsAbsentStatus(t *testing.T) {
	c := dtoContext(httpNodeSpec{id: "n1", key: "createUser", name: "Create user", method: http.MethodPost, path: "/users"}.node())
	rec := exec.Record{
		Node: "n1", Type: core.NodeTypeHTTP, Iteration: -1,
		Err:  "dial tcp: connection refused",
		HTTP: &exec.CallDetail{Method: http.MethodPost, URL: "https://api.example.com/users", DurationMs: 3},
	}
	row := c.event(recordEvent(rec, nil)).Log
	if row.Status != nil {
		t.Errorf("status = %d, want absent", *row.Status)
	}
	// The URL still has to be there: a connection refusal with no URL is close
	// to useless.
	if row.URL == "" || row.Error == "" {
		t.Errorf("row = %+v", row)
	}
	raw, err := json.Marshal(row)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if strings.Contains(string(raw), `"status"`) {
		t.Errorf("payload carries a status key: %s", raw)
	}
}

// LogsPanel joins a transform row's key list unconditionally, so the field has
// to be present even when it is empty — and absent on every other variant.
func TestTransformLogRowAlwaysCarriesInputNodes(t *testing.T) {
	c := dtoContext(store.BoardNode{ID: "t1", Type: "transform", Name: "Shape", Data: map[string]any{"key": "shape"}})
	rec := exec.Record{Node: "t1", Type: core.NodeTypeTransform, Iteration: -1, Output: map[string]any{"id": "usr_1"}}

	empty := c.event(recordEvent(rec, &binding.Output{})).Log
	raw, err := json.Marshal(empty)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(raw), `"inputNodes":[]`) {
		t.Errorf("empty key list was dropped: %s", raw)
	}

	rec.InputNodes = []string{"createUser", "createOrg"}
	filled := c.event(recordEvent(rec, &binding.Output{})).Log
	if filled.InputNodes == nil || !reflect.DeepEqual(*filled.InputNodes, rec.InputNodes) {
		t.Errorf("inputNodes = %v", filled.InputNodes)
	}
	if filled.Output != `{"id":"usr_1"}` {
		t.Errorf("output = %q", filled.Output)
	}

	httpRow := c.event(recordEvent(exec.Record{Node: "t1", Type: core.NodeTypeHTTP, Iteration: -1}, nil)).Log
	if httpRow.InputNodes != nil {
		t.Errorf("an http row carries inputNodes: %v", *httpRow.InputNodes)
	}
}

// A mock row reports the status it is configured to emit even when the body
// failed to parse and the node produced nothing.
func TestMockLogRowAlwaysCarriesItsStatus(t *testing.T) {
	c := dtoContext(
		store.BoardNode{ID: "m1", Type: "mock", Name: "Stub", Data: map[string]any{"key": "stub", "statusCode": 503, "body": "{oops"}},
		store.BoardNode{ID: "m2", Type: "mock", Name: "Default", Data: map[string]any{"key": "plain", "body": "{}"}},
	)
	failed := c.event(recordEvent(exec.Record{Node: "m1", Type: core.NodeTypeMock, Iteration: -1, Err: "body is not valid JSON"}, nil)).Log
	if failed.Status == nil || *failed.Status != 503 {
		t.Errorf("status = %v, want the configured 503", failed.Status)
	}
	if failed.Output != "" {
		t.Errorf("a failed mock carries an output: %q", failed.Output)
	}
	// An unset statusCode reports the engine's default, like a real call would.
	plain := c.event(recordEvent(exec.Record{Node: "m2", Type: core.NodeTypeMock, Iteration: -1}, &binding.Output{})).Log
	if plain.Status == nil || *plain.Status != exec.DefaultMockStatus {
		t.Errorf("status = %v", plain.Status)
	}
}

// A node that produced a JSON null is not a node that produced nothing: the
// failure test is the record's error, not a nil body.
func TestNullOutputStillRenders(t *testing.T) {
	c := dtoContext(store.BoardNode{ID: "t1", Type: "transform", Name: "Shape", Data: map[string]any{"key": "shape"}})
	row := c.event(recordEvent(exec.Record{Node: "t1", Type: core.NodeTypeTransform, Iteration: -1, Output: nil}, &binding.Output{})).Log
	if row.Output != "null" {
		t.Errorf("output = %q, want null", row.Output)
	}
}

// '<' and '&' are ordinary body bytes in a log row, not markup.
func TestOutputJSONDoesNotEscapeHTML(t *testing.T) {
	c := dtoContext(store.BoardNode{ID: "t1", Type: "transform", Name: "Shape", Data: map[string]any{"key": "shape"}})
	rec := exec.Record{Node: "t1", Type: core.NodeTypeTransform, Iteration: -1, Output: map[string]any{"html": "<b>&</b>"}}
	if got := c.event(recordEvent(rec, &binding.Output{})).Log.Output; got != `{"html":"<b>&</b>"}` {
		t.Errorf("output = %q", got)
	}
}

// Iteration rows need a per-iteration id or the panel collapses them onto one
// another.
func TestLoopRowIdentity(t *testing.T) {
	c := dtoContext(
		store.BoardNode{ID: "loop", Type: "for", Name: "Loop", Data: map[string]any{"key": "loop", "mode": "count", "count": 2}},
		httpNodeSpec{id: "child", key: "child", name: "Child", method: http.MethodPost, path: "/x", parent: "loop"}.node(),
	)
	first := c.event(recordEvent(exec.Record{Node: "child", Type: core.NodeTypeHTTP, Iteration: 0}, nil)).Log
	second := c.event(recordEvent(exec.Record{Node: "child", Type: core.NodeTypeHTTP, Iteration: 1}, nil)).Log
	if first.ID != "run-1-child-0" || second.ID != "run-1-child-1" {
		t.Errorf("row ids = %q, %q", first.ID, second.ID)
	}
	if first.Iteration == nil || *first.Iteration != 0 {
		t.Errorf("iteration = %v", first.Iteration)
	}
	summary := c.event(recordEvent(exec.Record{Node: "loop", Type: core.NodeTypeFor, Iteration: -1, Iterations: 2}, &binding.Output{})).Log
	if summary.ID != "run-1-loop" || summary.Iterations == nil || *summary.Iterations != 2 {
		t.Errorf("summary = %+v", summary)
	}
}

// The canvas card renders a note in a truncating span with no tooltip, so the
// engine prefix and the node echo it already shows are stripped.
func TestNoteStripsTheEngineEcho(t *testing.T) {
	c := dtoContext(
		store.BoardNode{ID: "loop", Type: "for", Name: "Loop", Data: map[string]any{"key": "orders"}},
		store.BoardNode{ID: "m1", Type: "mock", Name: "Stub", Data: map[string]any{"key": "stub"}},
	)
	cases := []struct {
		message string
		id      core.NodeID
		kind    core.NodeType
		want    string
	}{
		{`exec: for node "loop": iteration 2 failed`, "loop", core.NodeTypeFor, "iteration 2 failed"},
		{`exec: mock node "m1": body is not valid JSON`, "m1", core.NodeTypeMock, "body is not valid JSON"},
		{`exec: node "m1": something`, "m1", core.NodeTypeMock, "something"},
		{"422 Unprocessable Entity", "m1", core.NodeTypeMock, "422 Unprocessable Entity"},
		// A different node's id in the message is not an echo of this one, so
		// it survives — rewritten to that node's key.
		{`exec: node "loop" is not an upstream of this loop`, "m1", core.NodeTypeMock, `node "orders" is not an upstream of this loop`},
	}
	for _, tc := range cases {
		if got := c.note(tc.message, tc.id, tc.kind); got != tc.want {
			t.Errorf("note(%q) = %q, want %q", tc.message, got, tc.want)
		}
	}
}

// core/binding is deliberately key-free and prints raw node ids, so the bridge
// rewrites them: a row must read `node "createUser"`, not `node "n-8f2a1c"`.
func TestRewriteNodeIDs(t *testing.T) {
	c := dtoContext(
		store.BoardNode{ID: "n-8f2a1c", Type: "mock", Name: "Create user", Data: map[string]any{"key": "createUser"}},
		// This node's KEY is the previous node's ID: a per-node replace pass
		// would rewrite the first substitution a second time.
		store.BoardNode{ID: "n-2", Type: "mock", Name: "Odd", Data: map[string]any{"key": "n-8f2a1c"}},
		// A node with no key at all leaves its id alone rather than blanking it.
		store.BoardNode{ID: "n-3", Type: "mock", Name: "Keyless"},
	)
	cases := map[string]string{
		`node "n-8f2a1c" has not produced an output`: `node "createUser" has not produced an output`,
		`node "n-2" and node "n-8f2a1c"`:             `node "n-8f2a1c" and node "createUser"`,
		`node "n-3" is fine`:                         `node "n-3" is fine`,
		`node "unknown" is fine`:                     `node "unknown" is fine`,
		`no quotes here`:                             `no quotes here`,
	}
	for message, want := range cases {
		if got := c.rewriteNodeIDs(message); got != want {
			t.Errorf("rewrite(%q) = %q, want %q", message, got, want)
		}
	}
}

// The capture is what the frontend persists into the board file, so it needs
// the parsed body and the response headers a binding reads — neither of which
// the log row's response TEXT can provide.
func TestCaptureShape(t *testing.T) {
	c := dtoContext(httpNodeSpec{id: "n1", key: "createUser", name: "Create user", method: http.MethodGet, path: "/u"}.node())
	header := http.Header{}
	header.Set("Content-Type", "application/json")
	header.Set("X_Odd", "kept")
	rec := exec.Record{Node: "n1", Type: core.NodeTypeHTTP, Time: logStart, Duration: 300 * time.Millisecond, Iteration: -1}
	output := &binding.Output{Status: 201, Header: header, Body: map[string]any{"id": "usr_1"}, Truncated: true}

	got := c.event(recordEvent(rec, output)).Capture
	if got == nil {
		t.Fatal("no capture")
	}
	if got.Status != 201 || !got.Truncated {
		t.Errorf("capture = %+v", got)
	}
	if body, _ := got.Body.(map[string]any); body["id"] != "usr_1" {
		t.Errorf("body = %#v", got.Body)
	}
	// Keys arrive in Go's canonical form (X_Odd canonicalizes to X_odd, since
	// '_' is not a header separator) — the same form the Test tab already
	// hands the frontend, so the two paths agree. Binding lookups canonicalize
	// on read, so `headers.X_Odd` still resolves.
	if got.Headers["Content-Type"] != "application/json" || got.Headers["X_odd"] != "kept" {
		t.Errorf("headers = %v", got.Headers)
	}
	// The timestamp is when the response landed, in the frontend's ISO shape at
	// fixed millisecond precision so board files keep one form.
	if got.At != "2026-07-29T14:05:07.000Z" {
		t.Errorf("at = %q", got.At)
	}
}

// A failure leaves the previous capture in place rather than blanking the
// picker, so no capture travels with it.
func TestFailureAndSkipCarryNoCapture(t *testing.T) {
	c := dtoContext(store.BoardNode{ID: "m1", Type: "mock", Name: "Stub", Data: map[string]any{"key": "stub"}})
	failed := c.event(exec.Event{
		Kind: exec.EventNodeFinished, Node: "m1", Iteration: -1, Status: exec.StatusFailed,
		Record: &exec.Record{Node: "m1", Type: core.NodeTypeMock, Iteration: -1, Err: "boom"},
	})
	if failed.Capture != nil {
		t.Errorf("failure carries a capture: %+v", failed.Capture)
	}
	if failed.Note != "boom" {
		t.Errorf("note = %q", failed.Note)
	}
	skipped := c.event(exec.Event{Kind: exec.EventNodeFinished, Node: "m1", Iteration: -1, Status: exec.StatusSkipped})
	if skipped.Log != nil || skipped.Capture != nil || skipped.Status != string(exec.StatusSkipped) {
		t.Errorf("skip = %+v", skipped)
	}
}

// A board written by hand may omit the display name; the frontend falls back
// to the node id when it loads one, so the rows do too.
func TestLogRowFallsBackToTheNodeID(t *testing.T) {
	c := dtoContext(store.BoardNode{ID: "m1", Type: "mock", Data: map[string]any{"key": "stub"}})
	row := c.event(recordEvent(exec.Record{Node: "m1", Type: core.NodeTypeMock, Iteration: -1}, &binding.Output{})).Log
	if row.Node != "m1" {
		t.Errorf("node name = %q", row.Node)
	}
}

// One unreadable node must not abort the board: it decodes to a bare spec and
// fails alone at dispatch.
func TestDecodeSpecsToleratesABadNode(t *testing.T) {
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		{ID: "a", Type: "mock", Data: map[string]any{"key": "stub", "body": "{}"}},
		{ID: "b", Type: "nonsense", Data: map[string]any{"key": "odd"}},
	}}
	specs := decodeSpecs(board)
	if len(specs) != 2 {
		t.Fatalf("specs = %+v", specs)
	}
	if specs["a"].Mock == nil || specs["a"].Mock.Body != "{}" {
		t.Errorf("good node decoded to %+v", specs["a"])
	}
	if specs["b"].Kind != core.NodeType("nonsense") {
		t.Errorf("bad node decoded to %+v", specs["b"])
	}
}

// A note node runs nothing and carries no key, and must not be counted as a
// mock when rows are built.
func TestNoteNodesCarryNoSpec(t *testing.T) {
	specs := decodeSpecs(store.Board{ID: "b1", Nodes: []store.BoardNode{
		{ID: "n", Type: "note", Data: map[string]any{"text": "hi"}},
	}})
	if got := specs["n"]; got.Kind != core.NodeTypeNote || got.Key != "" {
		t.Errorf("note spec = %+v", got)
	}
	var _ nodespec.Spec = specs["n"]
}
