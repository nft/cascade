package exec

import (
	"context"
	"reflect"
	"testing"
	"time"

	"cascade/core"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
)

// The plan's done-when chain, engine-side: Create Org → [transform: active
// member emails] → Invite Member. The transform (script mode) filters the org
// response and Invite Member binds through the transform's synthetic output —
// bindings resolve end-to-end with zero special cases.
func TestTransformBetweenTwoHTTPNodes(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "create-org", Type: core.NodeTypeHTTP},
			{ID: "actives", Type: core.NodeTypeTransform},
			{ID: "invite", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{
			{From: "create-org", To: "actives"},
			{From: "actives", To: "invite"},
		},
	}
	orgBody := map[string]any{"members": []any{
		map[string]any{"email": "a@x.io", "active": true},
		map[string]any{"email": "b@x.io", "active": false},
	}}
	transport := transportOf(map[string]httpcall.Response{
		"/orgs":   jsonResponse(201, orgBody),
		"/invite": jsonResponse(200, map[string]any{"ok": true}),
	})

	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"create-org": httpSpec("createOrg", "POST", "/orgs"),
			"actives": transformScript("activeMembers", `
				const members = nodes.createOrg.body.members.filter(m => m.active)
				return { count: members.length, emails: members.map(m => m.email) }`),
			// Stored templates reference node IDs; the UI renders this one as
			// {{activeMembers.emails}} (the node's key).
			"invite": httpSpec("invite", "POST", "/invite", templateField("body.emails", "{{actives.emails}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	for id, want := range map[core.NodeID]Status{"create-org": StatusSuccess, "actives": StatusSuccess, "invite": StatusSuccess} {
		if res.Statuses[id] != want {
			t.Fatalf("node %s: status %s, want %s", id, res.Statuses[id], want)
		}
	}
	// A field whose whole value is one {{…}} keeps the referenced JSON type, so
	// the array arrives as an array rather than as interpolated text.
	inviteBody, _ := transport.sent[1].Body.(map[string]any)
	if !reflect.DeepEqual(inviteBody["emails"], []any{"a@x.io"}) {
		t.Fatalf("invite bound %#v through the transform, want [a@x.io]", inviteBody["emails"])
	}
	if res.Outputs["actives"].Status != 0 {
		t.Fatalf("transform output must be synthetic (status 0), got %d", res.Outputs["actives"].Status)
	}
	// Log record variants: http rows carry status, the transform row carries
	// input keys and output instead.
	if len(res.Records) != 3 {
		t.Fatalf("want 3 records, got %d", len(res.Records))
	}
	tr := res.Records[1]
	if tr.Type != core.NodeTypeTransform || tr.Status != 0 || tr.Output == nil {
		t.Fatalf("transform record wrong shape: %+v", tr)
	}
	if tr.HTTP != nil {
		t.Fatalf("transform record carries a call detail: %+v", tr.HTTP)
	}
	if !reflect.DeepEqual(tr.InputNodes, []string{"createOrg"}) {
		t.Fatalf("transform record inputs %v", tr.InputNodes)
	}
	if res.Records[0].Status != 201 || res.Records[0].Output != nil {
		t.Fatalf("http record wrong shape: %+v", res.Records[0])
	}
}

// Pick mode between the same nodes produces identical output to the script
// (the plan's parity criterion), using the [*] map extension.
func TestPickScriptParity(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "create-org", Type: core.NodeTypeHTTP},
			{ID: "actives", Type: core.NodeTypeTransform},
		},
		Edges: []core.Edge{{From: "create-org", To: "actives"}},
	}
	orgBody := map[string]any{"members": []any{
		map[string]any{"email": "a@x.io"},
		map[string]any{"email": "c@x.io"},
	}}
	run := func(spec nodespec.Spec) any {
		t.Helper()
		res, err := Run(context.Background(), g, Options{
			Transport: transportOf(map[string]httpcall.Response{"/orgs": jsonResponse(201, orgBody)}).do,
			Specs: map[core.NodeID]nodespec.Spec{
				"create-org": httpSpec("createOrg", "POST", "/orgs"),
				"actives":    spec,
			},
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.Statuses["actives"] != StatusSuccess {
			t.Fatalf("transform failed: %+v", res.Records)
		}
		return res.Outputs["actives"].Body
	}
	pick := run(transformPick("actives", refField("emails", "", "body.members[*].email")))
	script := run(transformScript("actives", `return { emails: res.body.members.map(m => m.email) }`))
	if !reflect.DeepEqual(pick, script) {
		t.Fatalf("pick %#v != script %#v", pick, script)
	}
}

// Note nodes never reach the executor: no status, no record, no output.
func TestNoteNodesNeverScheduled(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "a", Type: core.NodeTypeHTTP},
			{ID: "sticky", Type: core.NodeTypeNote},
		},
	}
	transport := transportOf(nil)
	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs:     map[core.NodeID]nodespec.Spec{"a": httpSpec("a", "GET", "/a")},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(transport.sent) != 1 {
		t.Fatalf("want exactly one executed node, got %d", len(transport.sent))
	}
	if _, ok := res.Statuses["sticky"]; ok {
		t.Fatal("note node got a run status")
	}
	if len(res.Records) != 1 {
		t.Fatalf("note node produced a record: %+v", res.Records)
	}
}

// A failing node fails with the error message; descendants are skipped.
func TestFailureSkipsDownstream(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "a", Type: core.NodeTypeHTTP},
			{ID: "t", Type: core.NodeTypeTransform},
			{ID: "b", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{{From: "a", To: "t"}, {From: "t", To: "b"}},
	}
	res, err := Run(context.Background(), g, Options{
		Transport: transportOf(map[string]httpcall.Response{"/a": jsonResponse(200, map[string]any{})}).do,
		Specs: map[core.NodeID]nodespec.Spec{
			"a": httpSpec("a", "GET", "/a"),
			"t": transformScript("t", `throw new Error("boom")`),
			"b": httpSpec("b", "GET", "/b"),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["t"] != StatusFailed || res.Statuses["b"] != StatusSkipped {
		t.Fatalf("statuses %v", res.Statuses)
	}
	if rec := res.Records[1]; rec.Err == "" {
		t.Fatalf("failed transform record carries no error: %+v", rec)
	}
}

// A mock node seeds a chain: its parsed JSON is a first-class output that a
// downstream http node binds against, same zero-special-case path as
// transform (plan 09 N2).
func TestMockNodeFeedsDownstreamBinding(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "fixture", Type: core.NodeTypeMock},
			{ID: "create", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{{From: "fixture", To: "create"}},
	}
	transport := transportOf(map[string]httpcall.Response{"/create": jsonResponse(201, map[string]any{"ok": true})})

	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"fixture": mockSpec("fixture", 207, `{"users":[{"name":"ada"}]}`),
			"create": httpSpec("create", "POST", "/create",
				templateField("body.name", "{{fixture.body.users[0].name}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["fixture"] != StatusSuccess || res.Statuses["create"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	body, _ := transport.sent[0].Body.(map[string]any)
	if body["name"] != "ada" {
		t.Fatalf("bound %#v through the mock, want ada", body["name"])
	}
	if res.Outputs["fixture"].Status != 207 {
		t.Fatalf("mock output status = %d, want the configured 207", res.Outputs["fixture"].Status)
	}
	// The mock record carries the produced body, like transform rows.
	if rec := res.Records[0]; rec.Type != core.NodeTypeMock || rec.Output == nil || rec.Status != 0 {
		t.Fatalf("mock record wrong shape: %+v", rec)
	}
}

func TestMockNodeDefaultsStatus(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{{ID: "fixture", Type: core.NodeTypeMock}}}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{"fixture": mockSpec("fixture", 0, `{}`)},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Outputs["fixture"].Status != DefaultMockStatus {
		t.Fatalf("status = %d, want %d", res.Outputs["fixture"].Status, DefaultMockStatus)
	}
}

// A delay spliced between two nodes passes its single upstream's output
// through unchanged — the same pointer — so downstream bindings (and `res`
// sugar) resolve through the delay as if it were not there.
func TestDelayNodePassesThroughSingleUpstream(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "fixture", Type: core.NodeTypeMock},
			{ID: "wait", Type: core.NodeTypeDelay},
			{ID: "create", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{
			{From: "fixture", To: "wait"},
			{From: "wait", To: "create"},
		},
	}
	transport := transportOf(map[string]httpcall.Response{"/create": jsonResponse(201, nil)})

	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"fixture": mockSpec("fixture", 200, `{"id":"u1"}`),
			"wait":    delaySpec("wait", 1),
			"create":  httpSpec("create", "POST", "/create", templateField("body.id", "{{wait.body.id}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["wait"] != StatusSuccess || res.Statuses["create"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	body, _ := transport.sent[0].Body.(map[string]any)
	if body["id"] != "u1" {
		t.Fatalf("bound %#v through the delay, want u1", body["id"])
	}
	if res.Outputs["wait"] != res.Outputs["fixture"] {
		t.Fatalf("delay output is not the upstream output pointer")
	}
	// Delay records carry the duration only, never a payload.
	if rec := res.Records[1]; rec.Type != core.NodeTypeDelay || rec.Output != nil || rec.Err != "" {
		t.Fatalf("delay record wrong shape: %+v", rec)
	}
}

// With zero upstreams a delay is a pure gate: Status 0, nil body.
func TestDelayNodeWithoutUpstreamOutputsNull(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{{ID: "wait", Type: core.NodeTypeDelay}}}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{"wait": delaySpec("wait", 1)},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	out := res.Outputs["wait"]
	if out == nil || out.Status != 0 || out.Body != nil {
		t.Fatalf("delay output = %+v, want Status 0 / nil body", out)
	}
}

// Cancelling mid-wait interrupts a sleeping delay immediately — an M7 stop
// must never wait a delay out.
func TestDelayNodeCancelInterruptsWait(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{{ID: "wait", Type: core.NodeTypeDelay}}}
	// The context is live when Run's loop checks it, so the delay is dispatched
	// and then interrupted — the pre-cancelled case is a different rule, tested
	// in TestCancelStopsBeforeTheNextNode.
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	start := time.Now()
	res, err := Run(ctx, g, Options{
		Specs: map[core.NodeID]nodespec.Spec{"wait": delaySpec("wait", int(nodespec.MaxDelay/time.Millisecond))},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("cancel took %v, want immediate", elapsed)
	}
	if res.Statuses["wait"] != StatusFailed {
		t.Fatalf("status = %s, want failed on cancel", res.Statuses["wait"])
	}
	if rec := res.Records[0]; rec.Err == "" {
		t.Fatalf("cancelled delay record must carry the ctx error: %+v", rec)
	}
}

// An out-of-range duration is a config-tier failure: it fails only that
// node's chain, like a mock's JSON typo.
func TestDelayNodeOutOfRangeDurationFailsOnlyItsChain(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "wait", Type: core.NodeTypeDelay},
			{ID: "dependent", Type: core.NodeTypeMock},
			{ID: "unrelated", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{{From: "wait", To: "dependent"}},
	}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"wait":      delaySpec("wait", int(nodespec.MaxDelay/time.Millisecond)+1),
			"dependent": mockSpec("dependent", 0, `{}`),
			"unrelated": mockSpec("unrelated", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := map[core.NodeID]Status{
		"wait":      StatusFailed,
		"dependent": StatusSkipped,
		"unrelated": StatusSuccess,
	}
	for id, s := range want {
		if res.Statuses[id] != s {
			t.Fatalf("node %s: status %s, want %s (all: %+v)", id, res.Statuses[id], s, res.Statuses)
		}
	}
}

// An unparseable body is a config-tier failure: the mock fails, its
// descendants skip, and an unrelated chain still runs.
func TestMockNodeInvalidJSONFailsOnlyItsChain(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "fixture", Type: core.NodeTypeMock},
			{ID: "dependent", Type: core.NodeTypeMock},
			{ID: "unrelated", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{{From: "fixture", To: "dependent"}},
	}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"fixture":   mockSpec("fixture", 0, `{"broken`),
			"dependent": mockSpec("dependent", 0, `{}`),
			"unrelated": mockSpec("unrelated", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := map[core.NodeID]Status{
		"fixture":   StatusFailed,
		"dependent": StatusSkipped,
		"unrelated": StatusSuccess,
	}
	for id, s := range want {
		if res.Statuses[id] != s {
			t.Fatalf("node %s: status %s, want %s (all: %+v)", id, res.Statuses[id], s, res.Statuses)
		}
	}
	if rec := res.Records[0]; rec.Err == "" {
		t.Fatalf("failed mock record must carry the parse error: %+v", rec)
	}
}

// A transform with nothing upstream is node config, not graph shape: the
// canvas creates one in a single click, so the graph stays valid and only the
// node fails. Before this moved, SaveBoard rejected the whole board.
func TestUnconnectedTransformValidatesButFailsAtDispatch(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "t", Type: core.NodeTypeTransform},
			{ID: "unrelated", Type: core.NodeTypeMock},
		},
	}
	if err := g.Validate(); err != nil {
		t.Fatalf("Validate: %v", err)
	}
	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"t":         transformScript("t", `return 1`),
			"unrelated": mockSpec("unrelated", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["t"] != StatusFailed {
		t.Fatalf("status = %s, want failed", res.Statuses["t"])
	}
	if res.Statuses["unrelated"] != StatusSuccess {
		t.Fatalf("an unrelated node was affected: %+v", res.Statuses)
	}
	if rec := res.Records[0]; rec.Err == "" {
		t.Fatalf("record carries no error: %+v", rec)
	}
}

func TestMissingSpecFailsOnlyItsNode(t *testing.T) {
	cases := []struct {
		name string
		node core.Node
	}{
		{"http", core.Node{ID: "n", Type: core.NodeTypeHTTP}},
		{"mock", core.Node{ID: "n", Type: core.NodeTypeMock}},
		{"delay", core.Node{ID: "n", Type: core.NodeTypeDelay}},
		{"for", core.Node{ID: "n", Type: core.NodeTypeFor}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := &core.Graph{Nodes: []core.Node{tc.node}}
			res, err := Run(context.Background(), g, Options{Transport: transportOf(nil).do})
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			if res.Statuses["n"] != StatusFailed {
				t.Fatalf("status = %s, want failed", res.Statuses["n"])
			}
		})
	}
}

// An http graph with no transport is a caller mistake, but it must still fail
// per node rather than taking the run down.
func TestMissingTransportFailsOnlyItsNode(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{
		{ID: "call", Type: core.NodeTypeHTTP},
		{ID: "fixture", Type: core.NodeTypeMock},
	}}
	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"call":    httpSpec("call", "GET", "/x"),
			"fixture": mockSpec("fixture", 0, `{}`),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["call"] != StatusFailed || res.Statuses["fixture"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
}
