package exec

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/transform"
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
	// The http runner is injected (M1 WP4); "invite" resolves its binding
	// against the transform's output the way the request builder will.
	var inviteGot any
	httpRunner := func(_ context.Context, node core.Node, env *binding.Env) (*binding.Output, error) {
		switch node.ID {
		case "create-org":
			return &binding.Output{Status: 201, Body: orgBody}, nil
		case "invite":
			// Stored templates reference node IDs; the UI renders this one
			// as {{activeMembers.emails}} (the node's key).
			v, err := binding.Template("{{actives.emails}}").Resolve(env)
			if err != nil {
				return nil, err
			}
			inviteGot = v
			return &binding.Output{Status: 200, Body: map[string]any{"ok": true}}, nil
		}
		return nil, errors.New("unexpected node")
	}

	res, err := Run(context.Background(), g, Options{
		HTTP: httpRunner,
		Transforms: map[core.NodeID]transform.Spec{
			"actives": {Mode: transform.ModeScript, Script: `
				const members = nodes.createOrg.body.members.filter(m => m.active)
				return { count: members.length, emails: members.map(m => m.email) }`},
		},
		Keys: map[core.NodeID]string{"create-org": "createOrg", "actives": "activeMembers"},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	for id, want := range map[core.NodeID]Status{"create-org": StatusSuccess, "actives": StatusSuccess, "invite": StatusSuccess} {
		if res.Statuses[id] != want {
			t.Fatalf("node %s: status %s, want %s", id, res.Statuses[id], want)
		}
	}
	if !reflect.DeepEqual(inviteGot, []any{"a@x.io"}) {
		t.Fatalf("invite bound %#v through the transform, want [a@x.io]", inviteGot)
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
	httpRunner := func(context.Context, core.Node, *binding.Env) (*binding.Output, error) {
		return &binding.Output{Status: 201, Body: map[string]any{"members": []any{
			map[string]any{"email": "a@x.io"},
			map[string]any{"email": "c@x.io"},
		}}}, nil
	}
	run := func(spec transform.Spec) any {
		t.Helper()
		res, err := Run(context.Background(), g, Options{
			HTTP:       httpRunner,
			Transforms: map[core.NodeID]transform.Spec{"actives": spec},
		})
		if err != nil {
			t.Fatalf("Run: %v", err)
		}
		if res.Statuses["actives"] != StatusSuccess {
			t.Fatalf("transform failed: %+v", res.Records)
		}
		return res.Outputs["actives"].Body
	}
	pick := run(transform.Spec{Mode: transform.ModePick, Pick: []transform.PickRow{
		{Key: "emails", Source: binding.NewRef("", "body.members[*].email")},
	}})
	script := run(transform.Spec{Mode: transform.ModeScript,
		Script: `return { emails: res.body.members.map(m => m.email) }`})
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
	called := 0
	res, err := Run(context.Background(), g, Options{
		HTTP: func(_ context.Context, node core.Node, _ *binding.Env) (*binding.Output, error) {
			called++
			if node.ID == "sticky" {
				t.Fatal("note node reached the HTTP runner")
			}
			return &binding.Output{Status: 200}, nil
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if called != 1 {
		t.Fatalf("want exactly one executed node, got %d", called)
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
		HTTP: func(context.Context, core.Node, *binding.Env) (*binding.Output, error) {
			return &binding.Output{Status: 200, Body: map[string]any{}}, nil
		},
		Transforms: map[core.NodeID]transform.Spec{
			"t": {Mode: transform.ModeScript, Script: `throw new Error("boom")`},
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
	var boundName any
	httpRunner := func(_ context.Context, _ core.Node, env *binding.Env) (*binding.Output, error) {
		v, err := binding.Template("{{fixture.body.users[0].name}}").Resolve(env)
		if err != nil {
			return nil, err
		}
		boundName = v
		return &binding.Output{Status: 201, Body: map[string]any{"ok": true}}, nil
	}

	res, err := Run(context.Background(), g, Options{
		HTTP: httpRunner,
		Mocks: map[core.NodeID]MockSpec{
			"fixture": {Status: 207, Body: []byte(`{"users":[{"name":"ada"}]}`)},
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["fixture"] != StatusSuccess || res.Statuses["create"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	if boundName != "ada" {
		t.Fatalf("bound %#v through the mock, want ada", boundName)
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
		Mocks: map[core.NodeID]MockSpec{"fixture": {Body: []byte(`{}`)}},
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
	var boundID any
	httpRunner := func(_ context.Context, _ core.Node, env *binding.Env) (*binding.Output, error) {
		v, err := binding.Template("{{wait.body.id}}").Resolve(env)
		if err != nil {
			return nil, err
		}
		boundID = v
		return &binding.Output{Status: 201, Body: nil}, nil
	}

	res, err := Run(context.Background(), g, Options{
		HTTP:   httpRunner,
		Mocks:  map[core.NodeID]MockSpec{"fixture": {Status: 200, Body: []byte(`{"id":"u1"}`)}},
		Delays: map[core.NodeID]time.Duration{"wait": time.Millisecond},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["wait"] != StatusSuccess || res.Statuses["create"] != StatusSuccess {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	if boundID != "u1" {
		t.Fatalf("bound %#v through the delay, want u1", boundID)
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
		Delays: map[core.NodeID]time.Duration{"wait": time.Millisecond},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	out := res.Outputs["wait"]
	if out == nil || out.Status != 0 || out.Body != nil {
		t.Fatalf("delay output = %+v, want Status 0 / nil body", out)
	}
}

// Cancelling the run interrupts a sleeping delay immediately — an M7 stop
// must never wait a delay out.
func TestDelayNodeCancelInterruptsWait(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{{ID: "wait", Type: core.NodeTypeDelay}}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	start := time.Now()
	res, err := Run(ctx, g, Options{
		Delays: map[core.NodeID]time.Duration{"wait": MaxDelay},
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
		Mocks: map[core.NodeID]MockSpec{
			"dependent": {Body: []byte(`{}`)},
			"unrelated": {Body: []byte(`{}`)},
		},
		Delays: map[core.NodeID]time.Duration{"wait": MaxDelay + time.Millisecond},
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
		Mocks: map[core.NodeID]MockSpec{
			"fixture":   {Body: []byte(`{"broken`)},
			"dependent": {Body: []byte(`{}`)},
			"unrelated": {Body: []byte(`{}`)},
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
