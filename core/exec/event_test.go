package exec

import (
	"context"
	"fmt"
	"reflect"
	"strings"
	"testing"

	"cascade/core"
	"cascade/core/httpcall"
	"cascade/core/nodespec"
)

// collectEvents runs with a live event channel and returns everything emitted,
// in order. The drainer reads until the channel is closed and never selects on
// a context — that is the caller-side contract that makes the engine's
// unconditional blocking send safe. The buffer is deliberately tiny so
// backpressure is real rather than theoretical.
func collectEvents(t *testing.T, run func(events chan<- Event) (*Result, error)) ([]Event, *Result, error) {
	t.Helper()
	ch := make(chan Event, 1)
	var events []Event
	drained := make(chan struct{})
	go func() {
		defer close(drained)
		for e := range ch {
			events = append(events, e)
		}
	}()
	res, err := run(ch)
	close(ch)
	<-drained
	return events, res, err
}

// trace renders an event stream as comparable one-line summaries.
func trace(events []Event) []string {
	out := make([]string, len(events))
	for i, e := range events {
		switch e.Kind {
		case EventRunStarted:
			out[i] = string(e.Kind)
		case EventRunFinished:
			out[i] = fmt.Sprintf("%s cancelled=%v", e.Kind, e.Cancelled)
		case EventLoopProgress:
			out[i] = fmt.Sprintf("%s %s %d/%d", e.Kind, e.Node, e.Done, e.Total)
		case EventNodeStarted:
			out[i] = fmt.Sprintf("%s %s#%d", e.Kind, e.Node, e.Iteration)
		default:
			out[i] = fmt.Sprintf("%s %s#%d %s", e.Kind, e.Node, e.Iteration, e.Status)
		}
	}
	return out
}

func TestEventStreamOrder(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "a", Type: core.NodeTypeMock},
			{ID: "b", Type: core.NodeTypeMock},
			{ID: "c", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{{From: "a", To: "b"}, {From: "b", To: "c"}},
	}
	events, _, err := collectEvents(t, func(ch chan<- Event) (*Result, error) {
		return Run(context.Background(), g, Options{
			RunID:  "run-1",
			Events: ch,
			Specs: map[core.NodeID]nodespec.Spec{
				"a": mockSpec("a", 0, `{}`),
				"b": mockSpec("b", 0, `{}`),
				"c": mockSpec("c", 0, `{}`),
			},
		})
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := []string{
		"run.started",
		"node.started a#-1", "node.finished a#-1 success",
		"node.started b#-1", "node.finished b#-1 success",
		"node.started c#-1", "node.finished c#-1 success",
		"run.finished cancelled=false",
	}
	if got := trace(events); !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %v\nwant %v", got, want)
	}
	for _, e := range events {
		if e.RunID != "run-1" {
			t.Fatalf("event %s carries run id %q", e.Kind, e.RunID)
		}
	}
	// run.started names the run set, which the frontend adopts wholesale over
	// its own synchronous pre-flight.
	if want := []core.NodeID{"a", "b", "c"}; !reflect.DeepEqual(events[0].Nodes, want) {
		t.Errorf("run.started nodes = %v, want %v", events[0].Nodes, want)
	}
	// The success record travels with its event, so the bridge builds the log
	// row without a second pass over Result.
	if events[2].Record == nil || events[2].Record.Node != "a" {
		t.Errorf("node.finished carries no record: %+v", events[2].Record)
	}
}

// A skip produces a status but no record, which is exactly why status
// transitions have to be events in their own right — a listener watching only
// records would never learn the node was skipped.
func TestSkipEmitsStatusWithoutRecord(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "a", Type: core.NodeTypeMock},
			{ID: "b", Type: core.NodeTypeMock},
			{ID: "c", Type: core.NodeTypeMock},
		},
		Edges: []core.Edge{{From: "a", To: "b"}, {From: "b", To: "c"}},
	}
	events, _, err := collectEvents(t, func(ch chan<- Event) (*Result, error) {
		return Run(context.Background(), g, Options{
			Events: ch,
			Specs: map[core.NodeID]nodespec.Spec{
				"a": mockSpec("a", 0, `{}`),
				"b": mockSpec("b", 0, `{"broken`),
				"c": mockSpec("c", 0, `{}`),
			},
		})
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := []string{
		"run.started",
		"node.started a#-1", "node.finished a#-1 success",
		"node.started b#-1", "node.finished b#-1 failed",
		// c is never started: a skipped node must not flash "running" first.
		"node.finished c#-1 skipped",
		"run.finished cancelled=false",
	}
	if got := trace(events); !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %v\nwant %v", got, want)
	}
	skip := events[len(events)-2]
	if skip.Record != nil {
		t.Errorf("skip event carries a record: %+v", skip.Record)
	}
	failed := events[4]
	if failed.Record == nil || failed.Record.Err == "" {
		t.Errorf("failure event carries no error record: %+v", failed.Record)
	}
}

func TestLoopProgressEvents(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "loop", Type: core.NodeTypeFor},
			{ID: "child", Type: core.NodeTypeMock, Parent: "loop"},
		},
	}
	events, _, err := collectEvents(t, func(ch chan<- Event) (*Result, error) {
		return Run(context.Background(), g, Options{
			Events: ch,
			Specs: map[core.NodeID]nodespec.Spec{
				"loop":  loopCount("loop", 2),
				"child": mockSpec("child", 0, `{"ok":true}`),
			},
		})
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := []string{
		"run.started",
		"node.started loop#-1",
		// 0/N lands before any child runs, so the header reads "0/2" while the
		// first iteration is in flight rather than staying blank.
		"loop.progress loop 0/2",
		"node.started child#0", "node.finished child#0 success",
		"loop.progress loop 1/2",
		"node.started child#1", "node.finished child#1 success",
		"loop.progress loop 2/2",
		"node.finished loop#-1 success",
		"run.finished cancelled=false",
	}
	if got := trace(events); !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %v\nwant %v", got, want)
	}
}

// The reason the engine's send is unconditional rather than a select against
// ctx.Done(): Go picks uniformly among ready select cases, so a cancelled run
// would drop roughly half its remaining events — and run.finished is emitted
// after the cancellation break, so it would race every single time. Run this
// with -race -count=100; a single pass would pass by luck.
func TestCancelledRunStillEmitsRunFinished(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{
			{ID: "a", Type: core.NodeTypeHTTP},
			{ID: "b", Type: core.NodeTypeMock},
			{ID: "c", Type: core.NodeTypeMock},
		},
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// Cancelling from inside the transport makes the timing deterministic:
	// the run is always cancelled after exactly one node.
	cancelling := func(context.Context, httpcall.Request, string) (httpcall.Response, error) {
		cancel()
		return httpcall.Response{Status: 200}, nil
	}

	events, res, err := collectEvents(t, func(ch chan<- Event) (*Result, error) {
		return Run(ctx, g, Options{
			Events:    ch,
			Transport: cancelling,
			Specs: map[core.NodeID]nodespec.Spec{
				"a": httpSpec("a", "GET", "/a"),
				"b": mockSpec("b", 0, `{}`),
				"c": mockSpec("c", 0, `{}`),
			},
		})
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if !res.Cancelled {
		t.Fatal("Result.Cancelled is false")
	}
	last := events[len(events)-1]
	if last.Kind != EventRunFinished || !last.Cancelled {
		t.Fatalf("last event = %+v, want a cancelled run.finished", last)
	}
	want := []string{
		"run.started",
		"node.started a#-1", "node.finished a#-1 success",
		"run.finished cancelled=true",
	}
	if got := trace(events); !reflect.DeepEqual(got, want) {
		t.Fatalf("\n got %v\nwant %v", got, want)
	}
}

// A graph the executor refuses outright still ends the stream, so a listener
// never waits forever for a run that never began.
func TestShapeErrorStillEmitsRunFinished(t *testing.T) {
	g := &core.Graph{
		Nodes: []core.Node{{ID: "a", Type: core.NodeTypeMock}, {ID: "b", Type: core.NodeTypeMock}},
		Edges: []core.Edge{{From: "a", To: "b"}, {From: "b", To: "a"}},
	}
	events, res, err := collectEvents(t, func(ch chan<- Event) (*Result, error) {
		return Run(context.Background(), g, Options{RunID: "run-9", Events: ch})
	})
	if err == nil {
		t.Fatal("Run() = nil, want a cycle error")
	}
	if res != nil {
		t.Errorf("Run returned a result for an invalid graph: %+v", res)
	}
	if len(events) != 1 {
		t.Fatalf("events = %v, want only run.finished", trace(events))
	}
	if events[0].Kind != EventRunFinished || events[0].RunID != "run-9" {
		t.Fatalf("event = %+v", events[0])
	}
	if !strings.Contains(events[0].Err, "cycle") {
		t.Errorf("run.finished error = %q, want the graph error", events[0].Err)
	}
}

// A nil channel disables streaming entirely — the batch and CLI paths.
func TestNilEventChannelIsNotAnError(t *testing.T) {
	g := &core.Graph{Nodes: []core.Node{{ID: "a", Type: core.NodeTypeMock}}}
	res, err := Run(context.Background(), g, Options{
		Specs: map[core.NodeID]nodespec.Spec{"a": mockSpec("a", 0, `{}`)},
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	if res.Statuses["a"] != StatusSuccess {
		t.Fatalf("status = %s", res.Statuses["a"])
	}
}

// A targeted run's run.started carries only the nodes it will touch.
func TestRunStartedCarriesTheTargetedSet(t *testing.T) {
	events, _, err := collectEvents(t, func(ch chan<- Event) (*Result, error) {
		return Run(context.Background(), targetGraph(), Options{
			Events:    ch,
			Transport: transportOf(nil).do,
			Target:    &Target{Node: "create-org", Scope: core.ScopeUpstream},
			Specs: map[core.NodeID]nodespec.Spec{
				"create-user": httpSpec("createUser", "POST", "/users"),
				"create-org":  httpSpec("createOrg", "POST", "/orgs"),
				"invite":      httpSpec("invite", "POST", "/invite"),
				"unrelated":   mockSpec("unrelated", 0, `{}`),
			},
		})
	})
	if err != nil {
		t.Fatalf("Run: %v", err)
	}
	want := []core.NodeID{"create-user", "create-org"}
	if !reflect.DeepEqual(events[0].Nodes, want) {
		t.Fatalf("run.started nodes = %v, want %v", events[0].Nodes, want)
	}
}
