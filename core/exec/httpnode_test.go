package exec

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
)

// realTransport is httpcall.Do itself, so these tests exercise the whole path
// the app will: nodespec builds the request, httpcall sends it, exec captures
// it. Credentials stay names — the engine never sees a secret.
func realTransport(client *http.Client) Transport {
	return func(ctx context.Context, req httpcall.Request, _ string) (httpcall.Response, error) {
		return httpcall.Do(ctx, client, req, nil)
	}
}

func TestHTTPNodeAgainstRealServer(t *testing.T) {
	var gotPath string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.String()
		// Slow enough that the millisecond-resolution duration is not zero.
		time.Sleep(3 * time.Millisecond)
		w.Header().Set("Location", "/v1/users/u1")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"u1"}`))
	}))
	defer server.Close()

	g := &core.Graph{Nodes: []core.Node{{ID: "call", Type: core.NodeTypeHTTP}}}
	res, err := Run(context.Background(), g, Options{
		Transport: realTransport(server.Client()),
		Specs: map[core.NodeID]nodespec.Spec{
			"call": {Kind: core.NodeTypeHTTP, Key: "createUser", HTTP: &nodespec.HTTPSpec{
				Method: http.MethodPost, Path: "/v1/users", Origin: server.URL,
				Fields: []nodespec.Field{literalField("query.dry", "0"), literalField("body.name", "Ada")},
			}},
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["call"] != StatusSuccess {
		t.Fatalf("status = %s (records: %+v)", res.Statuses["call"], res.Records)
	}
	if gotPath != "/v1/users?dry=0" {
		t.Errorf("server saw %q", gotPath)
	}
	rec := res.Records[0]
	if rec.Status != http.StatusCreated {
		t.Errorf("record status = %d", rec.Status)
	}
	if rec.Time.IsZero() {
		t.Error("record has no start time")
	}
	if rec.HTTP == nil {
		t.Fatal("http record carries no call detail")
	}
	if rec.HTTP.URL != server.URL+"/v1/users?dry=0" {
		t.Errorf("detail URL = %q", rec.HTTP.URL)
	}
	if rec.HTTP.Method != http.MethodPost || rec.HTTP.StatusText != "Created" {
		t.Errorf("detail = %+v", rec.HTTP)
	}
	if rec.HTTP.RequestBody != `{"name":"Ada"}` {
		t.Errorf("detail request body = %q", rec.HTTP.RequestBody)
	}
	if rec.HTTP.ResponseBody != `{"id":"u1"}` {
		t.Errorf("detail response body = %q", rec.HTTP.ResponseBody)
	}
	if rec.HTTP.DurationMs <= 0 {
		t.Errorf("detail duration = %dms, want the measured elapsed time", rec.HTTP.DurationMs)
	}
	// The captured output is what downstream nodes bind against.
	out := res.Outputs["call"]
	if out.Status != http.StatusCreated || out.Header.Get("Location") != "/v1/users/u1" {
		t.Errorf("output = %+v", out)
	}
}

// A response header the transport reports under a non-canonical name is still
// reachable by that name: outputOf rebuilds the map through Header.Set, and
// binding looks up through Header.Get, so both sides canonicalize identically.
func TestOutputOfKeepsOddHeadersReachable(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "call", Type: core.NodeTypeHTTP},
			{ID: "next", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{{From: "call", To: "next"}},
	}
	transport := &fakeTransport{responses: map[string]httpcall.Response{
		"/a": {Status: 200, Headers: map[string]string{"X_Odd": "yes"}},
	}}
	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"call": httpSpec("call", "GET", "/a"),
			"next": httpSpec("next", "POST", "/b", templateField("body.odd", "{{call.headers.X_Odd}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["next"] != StatusSuccess {
		t.Fatalf("status = %s (records: %+v)", res.Statuses["next"], res.Records)
	}
	body, _ := transport.sent[1].Body.(map[string]any)
	if body["odd"] != "yes" {
		t.Errorf("bound %#v, want yes", body["odd"])
	}
}

// A body dropped for exceeding the capture cap must say so. outputOf is the
// only place in Go that can know: every other Output is built from a body
// computed in process, so if this is dropped an over-cap response silently
// reports "value is a JSON null and has no sub-fields" instead.
func TestOutputOfCarriesTruncation(t *testing.T) {
	oversized := strings.Repeat("x", httpcall.MaxCaptureBytes+1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(oversized))
	}))
	defer server.Close()

	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "call", Type: core.NodeTypeHTTP},
			{ID: "next", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{{From: "call", To: "next"}},
	}
	res, err := Run(context.Background(), g, Options{
		Transport: realTransport(server.Client()),
		Specs: map[core.NodeID]nodespec.Spec{
			"call": {Kind: core.NodeTypeHTTP, Key: "call", HTTP: &nodespec.HTTPSpec{
				Method: http.MethodGet, Path: "/big", Origin: server.URL,
			}},
			"next": {Kind: core.NodeTypeHTTP, Key: "next", HTTP: &nodespec.HTTPSpec{
				Method: http.MethodPost, Path: "/next", Origin: server.URL,
				Fields: []nodespec.Field{templateField("body.x", "{{call.body.x}}")},
			}},
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !res.Outputs["call"].Truncated {
		t.Fatal("Output.Truncated is false for an over-cap response")
	}
	if res.Statuses["next"] != StatusFailed {
		t.Fatalf("downstream status = %s, want failed", res.Statuses["next"])
	}
	var nextErr string
	for _, rec := range res.Records {
		if rec.Node == "next" {
			nextErr = rec.Err
		}
	}
	if !strings.Contains(nextErr, "too large to capture") {
		t.Errorf("error = %q, want the capture-cap hint", nextErr)
	}
}

// A completed 4xx/5xx fails the node — a failed create must not let a
// dependent read run against a phantom id — but the record still carries the
// full call detail, so the log row shows the URL and the response body.
func TestFailureStatusFailsNodeButKeepsDetail(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "call", Type: core.NodeTypeHTTP},
			{ID: "next", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{{From: "call", To: "next"}},
	}
	res, err := Run(context.Background(), g, Options{
		Transport: transportOf(map[string]httpcall.Response{
			"/a": {Status: 422, BodyText: `{"error":"name is required"}`, DurationMs: 4},
		}).do,
		Specs: map[core.NodeID]nodespec.Spec{
			"call": httpSpec("call", "POST", "/a"),
			"next": httpSpec("next", "GET", "/b"),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["call"] != StatusFailed || res.Statuses["next"] != StatusSkipped {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	rec := res.Records[0]
	if !strings.Contains(rec.Err, "422") {
		t.Errorf("error = %q, want the status and its text", rec.Err)
	}
	if rec.HTTP == nil || rec.HTTP.Status != 422 || rec.HTTP.ResponseBody != `{"error":"name is required"}` {
		t.Fatalf("failed record lost its call detail: %+v", rec.HTTP)
	}
	if _, produced := res.Outputs["call"]; produced {
		t.Error("a failed call produced an output")
	}
}

// A transport that never reached a server still reports what it attempted, so
// a connection refusal produces a usable log row instead of an empty one.
func TestTransportErrorFailsOnlyItsNodeAndKeepsDetail(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "call", Type: core.NodeTypeHTTP},
			{ID: "unrelated", Type: core.NodeTypeMock},
		},
	}
	transport := &fakeTransport{err: errors.New("dial tcp: connection refused")}
	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"call":      httpSpec("call", "GET", "/a"),
			"unrelated": mockSpec("unrelated", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["call"] != StatusFailed || res.Statuses["unrelated"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	rec := res.Records[0]
	if !strings.Contains(rec.Err, "connection refused") {
		t.Errorf("error = %q", rec.Err)
	}
	if rec.HTTP == nil {
		t.Fatal("transport failure produced no call detail")
	}
	if rec.HTTP.URL == "" || rec.HTTP.Status != 0 {
		t.Errorf("detail = %+v, want the attempted URL and a zero status", rec.HTTP)
	}
}

// A request that cannot be built never reached the transport, so there is
// nothing to describe — and the node must still fail rather than send.
func TestUnbuildableRequestNeverReachesTheTransport(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{{ID: "call", Type: core.NodeTypeHTTP}}}
	transport := transportOf(nil)
	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"call": {Kind: core.NodeTypeHTTP, Key: "call", HTTP: &nodespec.HTTPSpec{
				Method: http.MethodGet, Path: "/v1/users/{id}", Origin: testOrigin,
			}},
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["call"] != StatusFailed {
		t.Fatalf("status = %s", res.Statuses["call"])
	}
	if len(transport.sent) != 0 {
		t.Fatalf("an unbuildable request was still sent: %+v", transport.sent)
	}
	if rec := res.Records[0]; rec.HTTP != nil || !strings.Contains(rec.Err, "path parameter") {
		t.Fatalf("record = %+v", rec)
	}
}

// EnvBase is consulted only when a node names an environment and carries no
// origin, and an unknown name fails just that node.
func TestEnvBaseResolvesOnlyWhenNeeded(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{
		{ID: "named", Type: core.NodeTypeHTTP},
		{ID: "unknown", Type: core.NodeTypeHTTP},
	}}
	transport := transportOf(nil)
	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		EnvBase: func(name string) (string, error) {
			if name != "staging" {
				return "", errors.New("no such environment")
			}
			return "https://staging.example.com", nil
		},
		Specs: map[core.NodeID]nodespec.Spec{
			"named": {Kind: core.NodeTypeHTTP, Key: "named", HTTP: &nodespec.HTTPSpec{
				Method: http.MethodGet, Path: "/a", Environment: "staging",
			}},
			"unknown": {Kind: core.NodeTypeHTTP, Key: "unknown", HTTP: &nodespec.HTTPSpec{
				Method: http.MethodGet, Path: "/b", Environment: "prod",
			}},
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["named"] != StatusSuccess || res.Statuses["unknown"] != StatusFailed {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	if transport.sent[0].EnvBase != "https://staging.example.com" {
		t.Errorf("env base = %q", transport.sent[0].EnvBase)
	}
}

// --- targeted runs (D10) -----------------------------------------------------

func targetGraph() *core.Graph {
	return &core.Graph{
		Nodes: []core.Node{
			{ID: "create-user", Type: core.NodeTypeHTTP},
			{ID: "create-org", Type: core.NodeTypeHTTP},
			{ID: "invite", Type: core.NodeTypeHTTP},
			{ID: "unrelated", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{
			{From: "create-user", To: "create-org"},
			{From: "create-org", To: "invite"},
		},
	}
}

// The core of D10: a downstream run starts at a node whose upstream is not in
// the run set. Without the runSet exemption in skipped(), the very node the
// user clicked Play on is marked skipped and the cascade takes the rest.
func TestDownstreamTargetWithSeedRunsTheTarget(t *testing.T) {
	transport := transportOf(nil)
	res, err := Run(context.Background(), targetGraph(), Options{
		Transport: transport.do,
		Target:    &Target{Node: "create-org", Scope: core.ScopeDownstream},
		Seed: map[core.NodeID]*binding.Output{
			"create-user": {Status: 201, Body: map[string]any{"id": "u1"}},
		},
		Specs: map[core.NodeID]nodespec.Spec{
			"create-user": httpSpec("createUser", "POST", "/users"),
			"create-org": httpSpec("createOrg", "POST", "/orgs",
				templateField("body.owner", "{{create-user.body.id}}")),
			"invite":    httpSpec("invite", "POST", "/invite"),
			"unrelated": mockSpec("unrelated", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["create-org"] != StatusSuccess || res.Statuses["invite"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	// Nodes outside the set carry no status at all, so the canvas leaves their
	// previous state alone rather than repainting them.
	for _, id := range []core.NodeID{"create-user", "unrelated"} {
		if _, present := res.Statuses[id]; present {
			t.Errorf("out-of-set node %q got a status", id)
		}
	}
	if len(transport.sent) != 2 {
		t.Fatalf("sent %d requests, want 2", len(transport.sent))
	}
	body, _ := transport.sent[0].Body.(map[string]any)
	if body["owner"] != "u1" {
		t.Errorf("seeded binding resolved to %#v, want u1", body["owner"])
	}
}

// A seed for a node the run will produce is ignored: a re-run must never
// resolve against the capture it is replacing.
//
// The leak this closes is narrow but real. A binding through an edge cannot
// see a stale seed — the seeded node runs first and overwrites it — and a
// script only sees its ancestors. A reference to a NON-ancestor can: the
// engine checks ancestry only at edit time outside a loop, so a field naming
// a node scheduled LATER in this run would read the previous run's value
// instead of failing by name.
func TestSeedInsideTheRunSetIsIgnored(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "root", Type: core.NodeTypeMock},
			// Declared before create-user, so among nodes freed at the same time
			// it runs first — while create-user is still pending.
			{ID: "probe", Type: core.NodeTypeTransform},
			{ID: "create-user", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{{From: "root", To: "probe"}, {From: "root", To: "create-user"}},
	}
	res, err := Run(context.Background(), g, Options{
		Transport: transportOf(map[string]httpcall.Response{
			"/users": jsonResponse(201, map[string]any{"id": "fresh"}),
		}).do,
		Target: &Target{Node: "root", Scope: core.ScopeDownstream},
		Seed: map[core.NodeID]*binding.Output{
			"create-user": {Status: 201, Body: map[string]any{"id": "stale"}},
		},
		Specs: map[core.NodeID]nodespec.Spec{
			"root":        mockSpec("root", 0, `{}`),
			"probe":       transformPick("probe", templateField("saw", "{{create-user.body.id}}")),
			"create-user": httpSpec("createUser", "POST", "/users"),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if out := res.Outputs["probe"]; out != nil {
		t.Fatalf("probe read %#v from an earlier run; a node this run produces must not be seeded", out.Body)
	}
	var probeErr string
	for _, rec := range res.Records {
		if rec.Node == "probe" {
			probeErr = rec.Err
		}
	}
	if !strings.Contains(probeErr, `node "create-user" has not produced an output`) {
		t.Errorf("probe error = %q; want the not-yet-run node named", probeErr)
	}
}

// Outside the run set the seed is exactly what makes a targeted run possible.
func TestSeedOutsideTheRunSetIsUsed(t *testing.T) {
	transport := transportOf(nil)
	_, err := Run(context.Background(), targetGraph(), Options{
		Transport: transport.do,
		Target:    &Target{Node: "invite", Scope: core.ScopeUpstream},
		Seed: map[core.NodeID]*binding.Output{
			"unrelated": {Status: 200, Body: map[string]any{"tag": "kept"}},
		},
		Specs: map[core.NodeID]nodespec.Spec{
			"create-user": httpSpec("createUser", "POST", "/users"),
			"create-org":  httpSpec("createOrg", "POST", "/orgs"),
			"invite": httpSpec("invite", "POST", "/invite",
				templateField("body.tag", "{{unrelated.body.tag}}")),
			"unrelated": mockSpec("unrelated", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	body, _ := transport.sent[len(transport.sent)-1].Body.(map[string]any)
	if body["tag"] != "kept" {
		t.Errorf("bound %#v, want the seeded value", body["tag"])
	}
}

// Targeting a loop child runs the loop it belongs to: a child has no meaning
// outside its iteration, so dispatching it alone would leave its loop-scoped
// bindings unresolvable.
func TestTargetingALoopChildRunsTheLoop(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "child", Type: core.NodeTypeMock, Parent: "loop"},
			{ID: "after", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{{From: "loop", To: "after"}},
	}
	res, err := Run(context.Background(), g, Options{
		Target: &Target{Node: "child", Scope: core.ScopeUpstream},
		Specs: map[core.NodeID]nodespec.Spec{
			"loop":  loopCount("loop", 2),
			"child": mockSpec("child", 0, `{"ok":true}`),
			"after": mockSpec("after", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["loop"] != StatusSuccess || res.Statuses["child"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	if _, present := res.Statuses["after"]; present {
		t.Error("upstream scope reached a descendant")
	}
}

func TestUnknownTargetFailsTheRun(t *testing.T) {
	_, err := Run(context.Background(), targetGraph(), Options{
		Target: &Target{Node: "ghost", Scope: core.ScopeDownstream},
	})
	if err == nil {
		t.Fatal("Run() = nil, want an unknown-target error")
	}
}

// --- cancellation ------------------------------------------------------------

// A cancelled run stops before dispatching the next node. Nodes never reached
// carry no status, so the canvas keeps their previous paint instead of turning
// into a wall of colour.
func TestCancelStopsBeforeTheNextNode(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "a", Type: core.NodeTypeMock},
			{ID: "b", Type: core.NodeTypeMock},
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	res, err := Run(ctx, g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"a": mockSpec("a", 0, `{}`),
			"b": mockSpec("b", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !res.Cancelled {
		t.Error("Result.Cancelled is false after a cancelled run")
	}
	if len(res.Statuses) != 0 {
		t.Errorf("statuses = %+v, want none — no node was reached", res.Statuses)
	}
	if len(res.Records) != 0 {
		t.Errorf("records = %+v, want none", res.Records)
	}
}
