package exec

import (
	"context"
	"errors"
	"reflect"
	"testing"

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
