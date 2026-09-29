package exec

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"cascade/core"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
)

// The plan's done-when chain, engine-side: a mock array feeds an each-mode
// loop; inside, an http child binds {{i}}, {{item.name}} and a loop
// ancestor; downstream of the loop a [*] wildcard maps over the aggregate.
func TestForEachModeAggregatesPerChild(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "seedUsers", Type: core.NodeTypeMock},
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "createUser", Type: core.NodeTypeHTTP, Parent: "loop"},
			{ID: "audit", Type: core.NodeTypeMock, Parent: "loop"},
			{ID: "report", Type: core.NodeTypeHTTP},
		},
		Edges: []core.Edge{
			{From: "seedUsers", To: "loop"},
			{From: "loop", To: "report"},
		},
	}
	// Each createUser call echoes its own id back, so the aggregate is built
	// from the values the loop scope resolved.
	transport := &fakeTransport{}
	transport.reply = func(req httpcall.Request) httpcall.Response {
		if req.Path == "/users" {
			body, _ := req.Body.(map[string]any)
			return jsonResponse(201, map[string]any{"id": body["id"]})
		}
		return jsonResponse(200, nil)
	}

	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"seedUsers": mockSpec("seedUsers", 0, `{"org":"acme","users":[{"name":"ada"},{"name":"lin"}]}`),
			"audit":     mockSpec("audit", 0, `{"ok":true}`),
			"loop":      loopEach("loop", "seedUsers", "body.users"),
			// Loop scope ({{i}}, {{item.…}}) and a loop ancestor in one template.
			"createUser": httpSpec("createUser", "POST", "/users",
				templateField("body.id", "u{{i}}-{{item.name}}-{{seedUsers.body.org}}")),
			"report": httpSpec("report", "POST", "/report",
				templateField("body.ids", "{{loop.createUser[*].id}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	for _, id := range []core.NodeID{"seedUsers", "loop", "createUser", "audit", "report"} {
		if res.Statuses[id] != StatusSuccess {
			t.Fatalf("node %s: status %s (all: %+v)", id, res.Statuses[id], res.Statuses)
		}
	}
	wantBody := map[string]any{
		"createUser": []any{
			map[string]any{"id": "u0-ada-acme"},
			map[string]any{"id": "u1-lin-acme"},
		},
		"audit": []any{
			map[string]any{"ok": true},
			map[string]any{"ok": true},
		},
	}
	if !reflect.DeepEqual(res.Outputs["loop"].Body, wantBody) {
		t.Fatalf("aggregate = %#v, want %#v", res.Outputs["loop"].Body, wantBody)
	}
	reportBody, _ := transport.sent[len(transport.sent)-1].Body.(map[string]any)
	if want := []any{"u0-ada-acme", "u1-lin-acme"}; !reflect.DeepEqual(reportBody["ids"], want) {
		t.Fatalf("report bound %#v via [*], want %#v", reportBody["ids"], want)
	}

	// Child records carry their iteration; the summary record closes the loop.
	iters := make(map[core.NodeID][]int)
	var summary *Record
	for i, rec := range res.Records {
		if rec.Node == "loop" {
			summary = &res.Records[i]
			continue
		}
		iters[rec.Node] = append(iters[rec.Node], rec.Iteration)
	}
	if !reflect.DeepEqual(iters["createUser"], []int{0, 1}) {
		t.Fatalf("createUser record iterations = %v, want [0 1]", iters["createUser"])
	}
	if summary == nil || summary.Type != core.NodeTypeFor || summary.Iterations != 2 || summary.Output != nil {
		t.Fatalf("loop summary record wrong shape: %+v", summary)
	}
	if !reflect.DeepEqual(iters["seedUsers"], []int{topLevelIteration}) {
		t.Fatalf("top-level record iteration = %v, want [%d]", iters["seedUsers"], topLevelIteration)
	}
}

func TestForCountModeRunsBodyNTimes(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "ping", Type: core.NodeTypeHTTP, Parent: "loop"},
		},
	}
	transport := &fakeTransport{}
	transport.reply = func(req httpcall.Request) httpcall.Response {
		body, _ := req.Body.(map[string]any)
		return jsonResponse(200, body["i"])
	}

	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"loop": loopCount("loop", 3),
			"ping": httpSpec("ping", "POST", "/ping", templateField("body.i", "{{i}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	var indices []any
	for _, req := range transport.sent {
		body, _ := req.Body.(map[string]any)
		indices = append(indices, body["i"])
	}
	if !reflect.DeepEqual(indices, []any{0, 1, 2}) {
		t.Fatalf("iteration indices = %v, want [0 1 2]", indices)
	}
	wantBody := map[string]any{"ping": []any{0, 1, 2}}
	if !reflect.DeepEqual(res.Outputs["loop"].Body, wantBody) {
		t.Fatalf("aggregate = %#v, want %#v", res.Outputs["loop"].Body, wantBody)
	}
}

// A primitive source array resolves via bare {{item}}, and a transform
// child's script sees `item` and `i` as globals.
func TestForPrimitiveItemsAndTransformScope(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "tags", Type: core.NodeTypeMock},
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "shape", Type: core.NodeTypeTransform, Parent: "loop"},
		},
		Edges: []core.Edge{{From: "tags", To: "loop"}},
	}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"tags":  mockSpec("tags", 0, `["foo","bar"]`),
			"loop":  loopEach("loop", "tags", ""),
			"shape": transformScript("shape", "return { tag: item, idx: i }"),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["loop"] != StatusSuccess {
		t.Fatalf("loop status = %s (records: %+v)", res.Statuses["loop"], res.Records)
	}
	wantBody := map[string]any{"shape": []any{
		map[string]any{"tag": "foo", "idx": float64(0)},
		map[string]any{"tag": "bar", "idx": float64(0)},
	}}
	// Script numbers normalize through JSON, hence float64.
	wantBody["shape"].([]any)[1].(map[string]any)["idx"] = float64(1)
	if !reflect.DeepEqual(res.Outputs["loop"].Body, wantBody) {
		t.Fatalf("aggregate = %#v, want %#v", res.Outputs["loop"].Body, wantBody)
	}
}

// A script's `nodes` holds what the node may read — its ancestors and, in a
// loop, the loop's — never every node that happened to run earlier.
func TestScriptNodesAreOnlyReadableAncestors(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "stranger", Type: core.NodeTypeMock},
			{ID: "seed", Type: core.NodeTypeMock},
			{ID: "top", Type: core.NodeTypeTransform},
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "sibling", Type: core.NodeTypeMock, Parent: "loop"},
			{ID: "first", Type: core.NodeTypeMock, Parent: "loop"},
			{ID: "shape", Type: core.NodeTypeTransform, Parent: "loop"},
		},
		Edges: []core.Edge{
			{From: "seed", To: "top"},
			{From: "seed", To: "loop"},
			{From: "first", To: "shape"},
		},
	}
	keysOf := "return Object.keys(nodes).sort()"
	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"stranger": mockSpec("stranger", 0, `{}`),
			"seed":     mockSpec("seed", 0, `{}`),
			"top":      transformScript("top", keysOf),
			"loop":     loopCount("loop", 1),
			"sibling":  mockSpec("sibling", 0, `{}`),
			"first":    mockSpec("first", 0, `{}`),
			"shape":    transformScript("shape", keysOf),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := res.Outputs["top"].Body; !reflect.DeepEqual(got, []any{"seed"}) {
		t.Errorf("top-level script saw %v; want only its ancestor", got)
	}
	want := map[string]any{"sibling": []any{map[string]any{}}, "first": []any{map[string]any{}}, "shape": []any{[]any{"first", "seed"}}}
	if got := res.Outputs["loop"].Body; !reflect.DeepEqual(got, want) {
		t.Errorf("loop aggregate = %#v; want the child script to see its own and the loop's ancestors", got)
	}
}

// A stored child ref that escapes the loop's ancestor set fails the child
// with the named error — it must never silently resolve against a
// non-ancestor that happened to run earlier in topological order.
func TestForChildRefEscapingScopeFailsNamed(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "outsider", Type: core.NodeTypeMock},
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "child", Type: core.NodeTypeHTTP, Parent: "loop"},
		},
	}
	res, err := Run(context.Background(), g, Options{
		Transport: transportOf(nil).do,
		Specs: map[core.NodeID]nodespec.Spec{
			"outsider": mockSpec("outsider", 0, `{"x":1}`),
			"loop":     loopCount("loop", 1),
			"child":    httpSpec("child", "POST", "/child", templateField("body.x", "{{outsider.body.x}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["outsider"] != StatusSuccess || res.Statuses["loop"] != StatusFailed {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	var childErr string
	for _, rec := range res.Records {
		if rec.Node == "child" {
			childErr = rec.Err
		}
	}
	if !strings.Contains(childErr, `node "outsider" is not an upstream of this loop`) {
		t.Fatalf("child error = %q, want the named scope error", childErr)
	}
}

// An empty loop body is a config-tier failure: the for node fails, its
// downstream skips, and an unrelated chain still runs.
func TestForEmptyBodyFailsOnlyItself(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "after", Type: core.NodeTypeMock},
			{ID: "unrelated", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{{From: "loop", To: "after"}},
	}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"after":     mockSpec("after", 0, `{}`),
			"unrelated": mockSpec("unrelated", 0, `{}`),
			"loop":      loopCount("loop", 2),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := map[core.NodeID]Status{
		"loop":      StatusFailed,
		"after":     StatusSkipped,
		"unrelated": StatusSuccess,
	}
	for id, s := range want {
		if res.Statuses[id] != s {
			t.Fatalf("node %s: status %s, want %s (all: %+v)", id, res.Statuses[id], s, res.Statuses)
		}
	}
	if rec := res.Records[0]; rec.Node != "loop" || !strings.Contains(rec.Err, "has no children") {
		t.Fatalf("loop record = %+v, want the no-children error", rec)
	}
}

// Fail-fast: a child failure marks the iteration failed and aborts the
// remaining iterations.
func TestForFailFastAbortsRemainingIterations(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "items", Type: core.NodeTypeMock},
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "create", Type: core.NodeTypeHTTP, Parent: "loop"},
			{ID: "after", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{
			{From: "items", To: "loop"},
			{From: "loop", To: "after"},
		},
	}
	// The second element makes the server answer 500, which fails the node.
	transport := &fakeTransport{}
	transport.reply = func(req httpcall.Request) httpcall.Response {
		body, _ := req.Body.(map[string]any)
		if body["item"] == "boom" {
			return jsonResponse(500, map[string]any{"error": "server exploded"})
		}
		return jsonResponse(200, body["item"])
	}

	res, err := Run(context.Background(), g, Options{
		Transport: transport.do,
		Specs: map[core.NodeID]nodespec.Spec{
			"items":  mockSpec("items", 0, `["ok","boom","never"]`),
			"after":  mockSpec("after", 0, `{}`),
			"loop":   loopEach("loop", "items", ""),
			"create": httpSpec("create", "POST", "/create", templateField("body.item", "{{item}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if len(transport.sent) != 2 {
		t.Fatalf("http ran %d times, want 2 (third iteration aborted)", len(transport.sent))
	}
	if res.Statuses["loop"] != StatusFailed || res.Statuses["after"] != StatusSkipped {
		t.Fatalf("statuses = %+v", res.Statuses)
	}
	var summary *Record
	for i, rec := range res.Records {
		if rec.Node == "loop" {
			summary = &res.Records[i]
		}
	}
	if summary == nil || summary.Iterations != 1 || !strings.Contains(summary.Err, "iteration 1 failed") {
		t.Fatalf("loop summary = %+v, want 1 completed iteration and the fail-fast error", summary)
	}
}

// Delay children run per iteration but are excluded from the aggregate —
// their output is a pass-through duplicate.
func TestForDelayChildExcludedFromAggregate(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "make", Type: core.NodeTypeMock, Parent: "loop"},
			{ID: "wait", Type: core.NodeTypeDelay, Parent: "loop"},
		},
		Edges: []core.Edge{{From: "make", To: "wait"}},
	}

	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{
			"make": mockSpec("make", 0, `{"n":1}`),
			"wait": delaySpec("wait", 1),
			"loop": loopCount("loop", 2),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["loop"] != StatusSuccess {
		t.Fatalf("loop status = %s (records: %+v)", res.Statuses["loop"], res.Records)
	}
	body, ok := res.Outputs["loop"].Body.(map[string]any)
	if !ok {
		t.Fatalf("aggregate body = %#v", res.Outputs["loop"].Body)
	}
	if _, present := body["wait"]; present {
		t.Fatalf("delay child leaked into the aggregate: %#v", body)
	}
	if got := body["make"]; !reflect.DeepEqual(got, []any{map[string]any{"n": float64(1)}, map[string]any{"n": float64(1)}}) {
		t.Fatalf("make aggregate = %#v", got)
	}
	delayRecords := 0
	for _, rec := range res.Records {
		if rec.Node == "wait" {
			delayRecords++
		}
	}
	if delayRecords != 2 {
		t.Fatalf("delay ran %d times, want once per iteration", delayRecords)
	}
}

// Config-tier spec failures: a count outside bounds and a non-array each
// source fail the node, not the run.
func TestForSpecConfigFailures(t *testing.T) {
	cases := []struct {
		name    string
		spec    nodespec.LoopSpec
		wantErr string
	}{
		{"count too low", nodespec.LoopSpec{Mode: nodespec.LoopModeCount, Count: 0}, "outside"},
		{"count above cap", nodespec.LoopSpec{Mode: nodespec.LoopModeCount, Count: nodespec.MaxLoopIterations + 1}, "outside"},
		{"non-array source", nodespec.LoopSpec{Mode: nodespec.LoopModeEach, Source: &nodespec.Ref{NodeID: "src", Path: "body.obj"}}, "must resolve to an array"},
		{"unknown mode", nodespec.LoopSpec{Mode: "while"}, "unknown mode"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := &core.Graph{
				Nodes: []core.Node{
					{ID: "src", Type: core.NodeTypeMock},
					{ID: "loop", Type: core.NodeTypeFor},
					{ID: "child", Type: core.NodeTypeMock, Parent: "loop"},
				},
				Edges: []core.Edge{{From: "src", To: "loop"}},
			}
			res, err := Run(context.Background(), g, Options{
				Specs: map[core.NodeID]nodespec.Spec{
					"src":   mockSpec("src", 0, `{"obj":{"a":1}}`),
					"child": mockSpec("child", 0, `{}`),
					"loop":  {Kind: core.NodeTypeFor, Key: "loop", Loop: &tc.spec},
				},
			})
			if err != nil {
				t.Fatalf("Run: %v", err)
			}
			if res.Statuses["loop"] != StatusFailed {
				t.Fatalf("loop status = %s, want failed", res.Statuses["loop"])
			}
			var loopErr string
			for _, rec := range res.Records {
				if rec.Node == "loop" {
					loopErr = rec.Err
				}
			}
			if !strings.Contains(loopErr, tc.wantErr) {
				t.Fatalf("loop error = %q, want it to contain %q", loopErr, tc.wantErr)
			}
		})
	}
}

// {{item}} outside an each-mode loop is a named error, not a nil resolve.
func TestItemOutsideEachModeFails(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "child", Type: core.NodeTypeHTTP, Parent: "loop"},
		},
	}
	res, err := Run(context.Background(), g, Options{
		Transport: transportOf(nil).do,
		Specs: map[core.NodeID]nodespec.Spec{
			"loop":  loopCount("loop", 1),
			"child": httpSpec("child", "POST", "/child", templateField("body.item", "{{item}}")),
		},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	var childErr string
	for _, rec := range res.Records {
		if rec.Node == "child" {
			childErr = rec.Err
		}
	}
	if !strings.Contains(childErr, "only available inside an each-mode for loop") {
		t.Fatalf("child error = %q, want the item-scope error", childErr)
	}
}
