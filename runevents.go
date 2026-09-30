package main

// RunEventName is the single Wails event every run transition travels on.
// One name with a discriminated payload rather than five names makes "events
// arrive in emission order" structural instead of something the frontend has
// to reason about, and it means one subscription and one teardown.
const RunEventName = "run:event"

// runEventBuffer sizes the channel between the engine and the drain
// goroutine. A run is I/O-bound on real HTTP, so this only has to absorb the
// burst a fast loop body produces while one EventsEmit is in flight.
const runEventBuffer = 64

// Run-level failures, all of which mean the run never started.
const (
	errMissingRunID = "run request has no run id"
	errRunInFlight  = "a run is already in progress — stop it before starting another"
	runPanicFormat  = "the engine failed unexpectedly: %v"
)
