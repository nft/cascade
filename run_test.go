package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"cascade/core"
	"cascade/core/exec"
	"cascade/core/httpcall"
	"cascade/store"
)

const (
	bearerSecret = "sk-live-must-never-be-logged-4f2a"
	querySecret  = "qk-live-must-never-be-logged-9c3b"
)

// A three-node FK chain runs green against a real server: each node's request
// carries the values bound from the one before it, and neither credential
// secret appears in anything the bridge publishes.
func TestRunBoardChain(t *testing.T) {
	srv, server := newJSONServer(map[string]jsonReply{
		"/users":              {http.StatusCreated, `{"id":"usr_1"}`},
		"/orgs":               {http.StatusCreated, `{"id":"org_1"}`},
		"/orgs/org_1/members": {http.StatusCreated, `{"id":"mem_1"}`},
	})
	defer srv.Close()

	app, projectID, secrets := newRunApp(t,
		map[string]string{"staging": srv.URL},
		store.Credential{Name: "staging-admin", Kind: httpcall.KindBearer},
		store.Credential{Name: "trace-key", Kind: httpcall.KindQuery, Param: "api_key"},
	)
	if err := secrets.SetSecret(projectID, "staging-admin", bearerSecret); err != nil {
		t.Fatalf("SetSecret: %v", err)
	}
	if err := secrets.SetSecret(projectID, "trace-key", querySecret); err != nil {
		t.Fatalf("SetSecret: %v", err)
	}

	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		httpNodeSpec{
			id: "create-user", key: "createUser", name: "Create user",
			method: http.MethodPost, path: "/users",
			environment: "staging", credential: "staging-admin",
			fields: []map[string]any{
				literalField("body.name", "Ada"),
				literalField("header.X-Trace", "t-1"),
			},
		}.node(),
		httpNodeSpec{
			id: "create-org", key: "createOrg", name: "Create org",
			method: http.MethodPost, path: "/orgs",
			environment: "staging", credential: "staging-admin",
			fields: []map[string]any{
				bindingField("body.owner_id", "create-user", "body.id"),
				literalField("query.dry_run", "false"),
			},
		}.node(),
		httpNodeSpec{
			id: "invite", key: "invite", name: "Invite member",
			method: http.MethodPost, path: "/orgs/{id}/members",
			environment: "staging", credential: "trace-key",
			fields: []map[string]any{
				bindingField("path.id", "create-org", "body.id"),
				templateField("body.note", "welcome {{create-user.body.id}}"),
			},
		}.node(),
	}, Edges: []store.BoardEdge{
		{From: "create-user", To: "create-org"},
		{From: "create-org", To: "invite"},
	}}

	collector, result, err := runBoard(t, app, projectID, RunRequest{RunID: "run-1", BoardID: "b1", Board: board})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}
	for _, id := range []string{"create-user", "create-org", "invite"} {
		if result.Statuses[id] != string(exec.StatusSuccess) {
			t.Fatalf("node %s status = %q, notes %v", id, result.Statuses[id], result.Notes)
		}
	}

	calls, bodies := server.seen()
	if len(calls) != 3 {
		t.Fatalf("server saw %d calls, want 3", len(calls))
	}
	if calls[0].Method != http.MethodPost || calls[0].URL.Path != "/users" || bodies[0] != `{"name":"Ada"}` {
		t.Errorf("first call = %s %s %s", calls[0].Method, calls[0].URL, bodies[0])
	}
	if got := calls[0].Header.Get("X-Trace"); got != "t-1" {
		t.Errorf("X-Trace = %q", got)
	}
	if got := calls[0].Header.Get("Authorization"); got != "Bearer "+bearerSecret {
		t.Errorf("Authorization = %q", got)
	}
	// The FK: create-org's body carries the id the server minted for the user.
	if bodies[1] != `{"owner_id":"usr_1"}` || calls[1].URL.RawQuery != "dry_run=false" {
		t.Errorf("second call = %s?%s %s", calls[1].URL.Path, calls[1].URL.RawQuery, bodies[1])
	}
	// The path parameter and a template both resolved against earlier nodes.
	if calls[2].URL.Path != "/orgs/org_1/members" || bodies[2] != `{"note":"welcome usr_1"}` {
		t.Errorf("third call = %s %s", calls[2].URL.Path, bodies[2])
	}
	if got := calls[2].URL.Query().Get("api_key"); got != querySecret {
		t.Errorf("query credential was not sent: %q", got)
	}

	// Nothing the bridge publishes may carry either secret: not the URL, not
	// the sent headers, not the request or response text.
	payload, err := json.Marshal(map[string]any{"events": collector.all(), "result": result})
	if err != nil {
		t.Fatalf("marshal DTOs: %v", err)
	}
	for _, secret := range []string{bearerSecret, querySecret} {
		if strings.Contains(string(payload), secret) {
			t.Fatalf("a secret reached the frontend DTOs: %s", payload)
		}
	}
	inviteRow := collector.logFor(t, "invite")
	if !strings.Contains(inviteRow.URL, "api_key="+httpcall.RedactedValue) {
		t.Errorf("invite row url = %q, want the redaction marker", inviteRow.URL)
	}
	if inviteRow.Status == nil || *inviteRow.Status != http.StatusCreated {
		t.Errorf("invite row status = %v", inviteRow.Status)
	}
	if inviteRow.Request != `{"note":"welcome usr_1"}` || inviteRow.Response != `{"id":"mem_1"}` {
		t.Errorf("invite row request/response = %q / %q", inviteRow.Request, inviteRow.Response)
	}

	// run.started names the run set the canvas paints as active.
	started := collector.all()[0]
	if started.Kind != string(exec.EventRunStarted) || len(started.Nodes) != 3 {
		t.Errorf("first event = %+v", started)
	}
	// The capture the frontend persists carries the parsed body and headers.
	for _, e := range collector.all() {
		if e.Node != "create-user" || e.Capture == nil {
			continue
		}
		body, _ := e.Capture.Body.(map[string]any)
		if body["id"] != "usr_1" || e.Capture.Headers["Content-Type"] != "application/json" {
			t.Errorf("capture = %+v", e.Capture)
		}
		if e.Capture.At == "" {
			t.Error("capture has no timestamp")
		}
	}
}

// A 4xx fails its node even though the call itself succeeded, and the failure
// cascades — while the row still shows the URL, status and response body that
// explain it.
func TestRunBoardFailingStatusSkipsDescendants(t *testing.T) {
	srv, _ := newJSONServer(map[string]jsonReply{
		"/users": {http.StatusCreated, `{"id":"usr_1"}`},
		"/orgs":  {http.StatusUnprocessableEntity, `{"error":"name taken"}`},
	})
	defer srv.Close()

	app, projectID, _ := newRunApp(t, map[string]string{"staging": srv.URL})
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		httpNodeSpec{id: "create-user", key: "createUser", name: "Create user", method: http.MethodPost, path: "/users", environment: "staging"}.node(),
		httpNodeSpec{id: "create-org", key: "createOrg", name: "Create org", method: http.MethodPost, path: "/orgs", environment: "staging"}.node(),
		httpNodeSpec{id: "invite", key: "invite", name: "Invite", method: http.MethodPost, path: "/invites", environment: "staging"}.node(),
	}, Edges: []store.BoardEdge{
		{From: "create-user", To: "create-org"},
		{From: "create-org", To: "invite"},
	}}

	collector, result, err := runBoard(t, app, projectID, RunRequest{RunID: "run-2", BoardID: "b1", Board: board})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}
	want := map[string]string{
		"create-user": string(exec.StatusSuccess),
		"create-org":  string(exec.StatusFailed),
		"invite":      string(exec.StatusSkipped),
	}
	for id, status := range want {
		if result.Statuses[id] != status {
			t.Errorf("node %s status = %q, want %q", id, result.Statuses[id], status)
		}
	}
	if note := result.Notes["create-org"]; note != "422 Unprocessable Entity" {
		t.Errorf("note = %q", note)
	}
	row := collector.logFor(t, "create-org")
	if row.Status == nil || *row.Status != http.StatusUnprocessableEntity {
		t.Fatalf("failed row status = %v", row.Status)
	}
	if row.Response != `{"error":"name taken"}` || row.URL == "" {
		t.Errorf("failed row = %+v", row)
	}
	// A skip has a status but no row: the node never ran, so there is nothing
	// to log.
	for _, r := range collector.logs() {
		if r.NodeID == "invite" {
			t.Errorf("skipped node produced a log row: %+v", r)
		}
	}
	// A failed node captures nothing, so the previous run's response stays in
	// the picker instead of being blanked by a call that produced no data.
	for _, e := range collector.all() {
		if e.Node != "create-user" && e.Capture != nil {
			t.Errorf("node %s produced a capture without succeeding: %+v", e.Node, e.Capture)
		}
	}
}

// A credential that cannot be resolved fails only the nodes naming it; an
// independent branch still runs.
func TestRunBoardUnresolvableCredentialFailsOneBranch(t *testing.T) {
	srv, server := newJSONServer(nil)
	defer srv.Close()

	app, projectID, _ := newRunApp(t,
		map[string]string{"staging": srv.URL},
		store.Credential{Name: "ghost", Kind: httpcall.KindBearer},
	)
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		httpNodeSpec{id: "guarded", key: "guarded", name: "Guarded", method: http.MethodPost, path: "/guarded", environment: "staging", credential: "ghost"}.node(),
		httpNodeSpec{id: "open", key: "open", name: "Open", method: http.MethodPost, path: "/open", environment: "staging"}.node(),
	}}

	_, result, err := runBoard(t, app, projectID, RunRequest{RunID: "run-3", BoardID: "b1", Board: board})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}
	if result.Statuses["guarded"] != string(exec.StatusFailed) {
		t.Errorf("guarded status = %q", result.Statuses["guarded"])
	}
	if result.Statuses["open"] != string(exec.StatusSuccess) {
		t.Errorf("open status = %q, want the sibling branch to run", result.Statuses["open"])
	}
	if !strings.Contains(result.Notes["guarded"], "no stored secret value") {
		t.Errorf("note = %q", result.Notes["guarded"])
	}
	calls, _ := server.seen()
	if len(calls) != 1 || calls[0].URL.Path != "/open" {
		t.Errorf("server saw %d calls; the guarded node must not reach the wire", len(calls))
	}
}

// A node's origin override wins over its environment, and a node naming an
// environment the project does not define fails with a message that names both
// ways out.
func TestRunBoardEnvironmentAndOrigin(t *testing.T) {
	envSrv, envServer := newJSONServer(nil)
	defer envSrv.Close()
	originSrv, originServer := newJSONServer(nil)
	defer originSrv.Close()

	app, projectID, _ := newRunApp(t, map[string]string{"staging": envSrv.URL})
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		httpNodeSpec{id: "by-env", key: "byEnv", name: "By env", method: http.MethodGet, path: "/env", environment: "staging"}.node(),
		httpNodeSpec{id: "by-origin", key: "byOrigin", name: "By origin", method: http.MethodGet, path: "/origin", environment: "staging", origin: originSrv.URL}.node(),
		httpNodeSpec{id: "unknown-env", key: "unknownEnv", name: "Unknown", method: http.MethodGet, path: "/nope", environment: "prod"}.node(),
	}}

	_, result, err := runBoard(t, app, projectID, RunRequest{RunID: "run-4", BoardID: "b1", Board: board})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}
	if result.Statuses["by-env"] != string(exec.StatusSuccess) || result.Statuses["by-origin"] != string(exec.StatusSuccess) {
		t.Fatalf("statuses = %v, notes = %v", result.Statuses, result.Notes)
	}
	envCalls, _ := envServer.seen()
	originCalls, _ := originServer.seen()
	if len(envCalls) != 1 || envCalls[0].URL.Path != "/env" {
		t.Errorf("environment server saw %d calls", len(envCalls))
	}
	if len(originCalls) != 1 || originCalls[0].URL.Path != "/origin" {
		t.Errorf("origin server saw %d calls", len(originCalls))
	}
	if result.Statuses["unknown-env"] != string(exec.StatusFailed) {
		t.Errorf("unknown-env status = %q", result.Statuses["unknown-env"])
	}
	if !strings.Contains(result.Notes["unknown-env"], `environment "prod"`) {
		t.Errorf("note = %q", result.Notes["unknown-env"])
	}
}

// A targeted run covers only the target's subgraph and resolves its bindings
// from the seed captures of nodes it deliberately did not re-run.
func TestRunBoardTargetWithSeed(t *testing.T) {
	srv, server := newJSONServer(nil)
	defer srv.Close()

	app, projectID, _ := newRunApp(t, map[string]string{"staging": srv.URL})
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		httpNodeSpec{id: "create-user", key: "createUser", name: "Create user", method: http.MethodPost, path: "/users", environment: "staging"}.node(),
		httpNodeSpec{
			id: "create-org", key: "createOrg", name: "Create org",
			method: http.MethodPost, path: "/orgs", environment: "staging",
			fields: []map[string]any{bindingField("body.owner_id", "create-user", "body.id")},
		}.node(),
	}, Edges: []store.BoardEdge{{From: "create-user", To: "create-org"}}}

	_, result, err := runBoard(t, app, projectID, RunRequest{
		RunID: "run-5", BoardID: "b1", Board: board,
		Target: &RunTarget{Node: "create-org", Scope: string(core.ScopeDownstream)},
		Seed: map[string]RunCapture{
			"create-user": {Status: 201, Body: map[string]any{"id": "usr_seeded"}, At: "2026-07-01T00:00:00.000Z"},
		},
	})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}
	// The target must not be marked skipped for an upstream this run never ran.
	if result.Statuses["create-org"] != string(exec.StatusSuccess) {
		t.Fatalf("create-org status = %q, notes %v", result.Statuses["create-org"], result.Notes)
	}
	if _, present := result.Statuses["create-user"]; present {
		t.Errorf("a node outside the run set carries a status: %v", result.Statuses)
	}
	calls, bodies := server.seen()
	if len(calls) != 1 || bodies[0] != `{"owner_id":"usr_seeded"}` {
		t.Errorf("server saw %d calls, first body %q", len(calls), bodies[0])
	}
}

// A For container runs its body once per iteration: the server sees one call
// each, {{i}} resolves to the index, every row gets its own id and iteration
// chip, and progress reaches the header before the first child runs.
func TestRunBoardLoop(t *testing.T) {
	srv, server := newJSONServer(nil)
	defer srv.Close()

	app, projectID, _ := newRunApp(t, map[string]string{"staging": srv.URL})
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		{ID: "loop", Type: string(core.NodeTypeFor), Name: "Repeat", Data: map[string]any{
			"key": "repeat", "mode": "count", "count": 3,
		}},
		httpNodeSpec{
			id: "child", key: "child", name: "Child",
			method: http.MethodPost, path: "/items", environment: "staging", parent: "loop",
			fields: []map[string]any{templateField("body.n", "item {{i}}")},
		}.node(),
	}}

	collector, result, err := runBoard(t, app, projectID, RunRequest{RunID: "run-l", BoardID: "b1", Board: board})
	if err != nil {
		t.Fatalf("RunBoard: %v", err)
	}
	if result.Statuses["loop"] != string(exec.StatusSuccess) {
		t.Fatalf("loop status = %q, notes %v", result.Statuses["loop"], result.Notes)
	}
	_, bodies := server.seen()
	want := []string{`{"n":"item 0"}`, `{"n":"item 1"}`, `{"n":"item 2"}`}
	if !reflect.DeepEqual(bodies, want) {
		t.Errorf("bodies = %v, want %v", bodies, want)
	}

	var progress []string
	for _, e := range collector.all() {
		if e.Progress != nil {
			progress = append(progress, fmt.Sprintf("%d/%d", e.Progress.Done, e.Progress.Total))
		}
	}
	// 0/3 lands before the first iteration, so the header never sits blank.
	if wantProgress := []string{"0/3", "1/3", "2/3", "3/3"}; !reflect.DeepEqual(progress, wantProgress) {
		t.Errorf("progress = %v, want %v", progress, wantProgress)
	}

	var childRows []string
	for _, row := range collector.logs() {
		if row.NodeID != "child" {
			continue
		}
		if row.Iteration == nil {
			t.Fatalf("loop child row has no iteration: %+v", row)
		}
		childRows = append(childRows, row.ID)
	}
	if wantIDs := []string{"run-l-child-0", "run-l-child-1", "run-l-child-2"}; !reflect.DeepEqual(childRows, wantIDs) {
		t.Errorf("child row ids = %v, want %v", childRows, wantIDs)
	}
	summary := collector.logFor(t, "loop")
	if summary.Kind != string(core.NodeTypeFor) || summary.Iterations == nil || *summary.Iterations != 3 {
		t.Errorf("loop summary = %+v", summary)
	}
	// The aggregate the loop captures is what downstream [*] bindings map over.
	for _, e := range collector.all() {
		if e.Node != "loop" || e.Capture == nil {
			continue
		}
		body, _ := e.Capture.Body.(map[string]any)
		if items, _ := body["child"].([]any); len(items) != 3 {
			t.Errorf("loop capture = %#v", e.Capture.Body)
		}
	}
}
