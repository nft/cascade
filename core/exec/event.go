package exec

import "cascade/core"

// Live run events (plan 11 D12). M1's "drop everything except state
// transitions under backpressure" is amended here: skipped nodes emit a status
// but no Record, and per-node log rows travel as events, so dropping is
// dropping exactly what the user debugs with.
type EventKind string

const (
	EventRunStarted   EventKind = "run.started"
	EventNodeStarted  EventKind = "node.started"
	EventNodeFinished EventKind = "node.finished"
	EventLoopProgress EventKind = "loop.progress"
	EventRunFinished  EventKind = "run.finished"
)

// Event is one live run transition. Status stays a terminal-outcome enum —
// there is deliberately no StatusRunning, because Result.Statuses is what
// skipped() tests; liveness is carried by Kind instead.
type Event struct {
	Kind  EventKind
	RunID string
	// Node and Iteration identify the emitting node; a loop child repaints the
	// same canvas node once per iteration. Iteration is topLevelIteration (-1)
	// outside a loop, and meaningless on the two run-level kinds, which name no
	// node.
	Node      core.NodeID
	Iteration int
	// Status and Record are set on node.finished; Record is nil for skips,
	// which produce a status but no record.
	Status Status
	Record *Record
	// Done and Total are set on loop.progress.
	Done, Total int
	// Nodes is the run set, set on run.started.
	Nodes []core.NodeID
	// Err and Cancelled are set on run.finished.
	Err       string
	Cancelled bool
}

// emit blocks until the drainer takes the event. It deliberately does NOT
// select on ctx.Done(): Go picks uniformly among ready select cases, so a
// cancelled run would drop roughly half its remaining events even with buffer
// space free — and run.finished is emitted AFTER the cancellation break, so it
// would race every single time. The contract that makes a blocking send safe
// is on the caller: the drain goroutine reads until the channel is closed and
// never selects on a context, so a send can only ever block for backpressure,
// never deadlock.
//
// A nil channel disables streaming entirely (the batch and CLI paths), which
// is why the check lives here rather than at each call site.
func emit(events chan<- Event, e Event) {
	if events == nil {
		return
	}
	events <- e
}

// emit stamps the run id on every event, so no call site can forget it.
func (r *runner) emit(e Event) {
	e.RunID = r.opts.RunID
	emit(r.opts.Events, e)
}
