package main

import (
	"context"
	"strings"
	"testing"
	"time"

	"cascade/core"
	"cascade/core/exec"
	"cascade/store"
)

// StopRun interrupts a waiting delay instead of letting the run sit out its
// full duration, and the stream still ends with a cancelled run.finished.
func TestStopRunInterruptsADelay(t *testing.T) {
	app, projectID, _ := newRunApp(t, nil)
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		{ID: "wait", Type: string(core.NodeTypeDelay), Name: "Wait", Data: map[string]any{"key": "wait", "durationMs": 5000}},
	}}

	collector := &eventCollector{}
	app.emitRunEvent = collector.add
	type outcome struct {
		result  RunResult
		err     error
		elapsed time.Duration
	}
	done := make(chan outcome, 1)
	go func() {
		started := time.Now()
		result, err := app.RunBoard(projectID, RunRequest{RunID: "run-6", BoardID: "b1", Board: board})
		done <- outcome{result, err, time.Since(started)}
	}()

	collector.waitFor(t, "the delay to start", func(e runEvent) bool {
		return e.Kind == string(exec.EventNodeStarted) && e.Node == "wait"
	})
	if err := app.StopRun("run-6"); err != nil {
		t.Fatalf("StopRun: %v", err)
	}

	select {
	case got := <-done:
		if got.err != nil {
			t.Fatalf("RunBoard: %v", got.err)
		}
		if got.elapsed > time.Second {
			t.Errorf("run took %v — the delay was not interrupted", got.elapsed)
		}
		if !got.result.Cancelled {
			t.Error("RunResult.Cancelled is false")
		}
	case <-time.After(5 * time.Second):
		t.Fatal("RunBoard did not return after StopRun")
	}

	events := collector.all()
	last := events[len(events)-1]
	if last.Kind != string(exec.EventRunFinished) || !last.Cancelled {
		t.Fatalf("last event = %+v, want a cancelled run.finished", last)
	}
	// The node card and its log row are where the user reads what Stop did.
	// context.Canceled's own wording names the plumbing and reads like a
	// fault, for the one outcome they asked for.
	finished := collector.finishedFor(t, "wait")
	if finished.Note != stoppedMessage {
		t.Errorf("note = %q, want %q", finished.Note, stoppedMessage)
	}
	row := collector.logFor(t, "wait")
	if strings.Contains(row.Error, cancelledText) || !strings.Contains(row.Error, stoppedMessage) {
		t.Errorf("log row error = %q, want it to say %q", row.Error, stoppedMessage)
	}
	// Stopping an id that is not running must not error, so a second click or
	// a late Stop is harmless.
	if err := app.StopRun("run-6"); err != nil {
		t.Errorf("StopRun after the run finished: %v", err)
	}
}

// One run at a time: the guard is server-side because the frontend's own flag
// does not survive a reload.
func TestRunBoardRejectsAConcurrentRun(t *testing.T) {
	app, projectID, _ := newRunApp(t, nil)
	board := store.Board{ID: "b1", Nodes: []store.BoardNode{
		{ID: "wait", Type: string(core.NodeTypeDelay), Name: "Wait", Data: map[string]any{"key": "wait", "durationMs": 5000}},
	}}

	collector := &eventCollector{}
	app.emitRunEvent = collector.add
	done := make(chan error, 1)
	go func() {
		_, err := app.RunBoard(projectID, RunRequest{RunID: "run-7", BoardID: "b1", Board: board})
		done <- err
	}()
	collector.waitFor(t, "the first run to start", func(e runEvent) bool {
		return e.Kind == string(exec.EventNodeStarted)
	})

	_, err := app.RunBoard(projectID, RunRequest{RunID: "run-8", BoardID: "b1", Board: board})
	if err == nil || !strings.Contains(err.Error(), "already in progress") {
		t.Fatalf("second RunBoard error = %v, want a rejection", err)
	}

	if err := app.StopRun("run-7"); err != nil {
		t.Fatalf("StopRun: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("first RunBoard: %v", err)
	}
	// The slot is released, so the next run is accepted.
	if _, err := app.RunBoard(projectID, RunRequest{RunID: "run-9", BoardID: "b1", Board: store.Board{ID: "b1"}}); err != nil {
		t.Errorf("RunBoard after the first finished: %v", err)
	}
}

func TestRunBoardRejectsAnEmptyRunID(t *testing.T) {
	app, projectID, _ := newRunApp(t, nil)
	if _, err := app.RunBoard(projectID, RunRequest{BoardID: "b1"}); err == nil {
		t.Fatal("RunBoard accepted a request with no run id")
	}
}

// An engine panic must fail the run, not the app — and the recovery has to
// close the event channel, or the drain goroutine blocks forever and RunBoard
// never returns.
func TestRunGraphRecoversAnEnginePanic(t *testing.T) {
	events := make(chan exec.Event, runEventBuffer)
	var drained []exec.Event
	done := make(chan struct{})
	go func() {
		defer close(done)
		for e := range events {
			drained = append(drained, e)
		}
	}()

	result, err := runGraph(context.Background(), func(context.Context, *core.Graph, exec.Options) (*exec.Result, error) {
		panic("engine bug")
	}, &core.Graph{}, exec.Options{RunID: "run-x", Events: events}, events)

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the event channel was never closed")
	}
	if err == nil || !strings.Contains(err.Error(), "engine bug") {
		t.Fatalf("err = %v, want the panic value", err)
	}
	if result != nil {
		t.Errorf("result = %+v, want nil", result)
	}
	if len(drained) != 1 || drained[0].Kind != exec.EventRunFinished {
		t.Fatalf("events = %+v, want one run.finished", drained)
	}
}
