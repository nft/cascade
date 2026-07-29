package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"cascade/core"
	"cascade/core/exec"
	"cascade/core/nodespec"
	"cascade/store"
)

// logTimeLayout is the run log's wall-clock column. Local time: the user reads
// it against their own clock.
const logTimeLayout = "15:04:05.000"

// captureTimeLayout is the frontend's ISO timestamp at fixed millisecond
// precision, so a board file's capture times keep one shape no matter which
// side wrote them (time.RFC3339Nano trims trailing zeros).
const captureTimeLayout = "2006-01-02T15:04:05.000Z"

// execErrorPrefix tags engine errors for Go callers. The user is already
// inside the engine, so it is stripped on the way out.
const execErrorPrefix = "exec: "

type runProgress struct {
	Done  int `json:"done"`
	Total int `json:"total"`
}

// runLogEntry is the five-variant LogEntry from model.ts, built here so the
// frontend appends rows it does not construct: the variant mapping, row
// identity, wall clock and display name are exactly the contract that drifts
// when duplicated.
type runLogEntry struct {
	Kind       string `json:"kind"` // http | transform | mock | delay | for
	ID         string `json:"id"`   // runId-nodeId[-iteration]
	RunID      string `json:"runId"`
	Time       string `json:"time"`
	Node       string `json:"node"` // display name
	NodeID     string `json:"nodeId"`
	DurationMs int    `json:"durationMs"`
	Iteration  *int   `json:"iteration,omitempty"` // the engine's -1 maps to absent
	Error      string `json:"error,omitempty"`
	Method     string `json:"method,omitempty"`
	URL        string `json:"url,omitempty"`
	// Status is a pointer because a call that never reached a server has no
	// status and 0 is not a usable stand-in.
	Status   *int   `json:"status,omitempty"`
	Request  string `json:"request,omitempty"`
	Response string `json:"response,omitempty"`
	// InputNodes is a pointer because a transform row must carry the key list
	// even when it is empty — LogsPanel joins it unconditionally — while the
	// other four variants must not carry it at all.
	InputNodes *[]string `json:"inputNodes,omitempty"`
	Output     string    `json:"output,omitempty"`
	Iterations *int      `json:"iterations,omitempty"`
}

// runEvent is one live transition on the wire. Kind discriminates which of the
// optional halves is populated.
type runEvent struct {
	Kind      string       `json:"kind"`
	RunID     string       `json:"runId"`
	ProjectID string       `json:"projectId"`
	BoardID   string       `json:"boardId"`
	Node      string       `json:"node,omitempty"`
	Iteration *int         `json:"iteration,omitempty"`
	Status    string       `json:"status,omitempty"`
	Note      string       `json:"note,omitempty"`
	Nodes     []string     `json:"nodes,omitempty"`
	Progress  *runProgress `json:"progress,omitempty"`
	Log       *runLogEntry `json:"log,omitempty"`
	Capture   *RunCapture  `json:"capture,omitempty"`
	Error     string       `json:"error,omitempty"`
	Cancelled bool         `json:"cancelled,omitempty"`
}

// runNode is the per-node presentation data the engine's events do not carry.
type runNode struct {
	name string
	key  string
	// mockStatus is the status a mock node is configured to emit. It is held
	// here because a mock row reports it even when the body fails to parse and
	// the node produced no output at all.
	mockStatus int
}

// runContext turns engine events into frontend DTOs: the (project, board) pair
// every event is scoped to, plus each node's presentation data.
type runContext struct {
	projectID string
	boardID   string
	nodes     map[core.NodeID]runNode
}

func newRunContext(projectID, boardID string, board store.Board, specs map[core.NodeID]nodespec.Spec) runContext {
	nodes := make(map[core.NodeID]runNode, len(board.Nodes))
	for _, n := range board.Nodes {
		spec := specs[core.NodeID(n.ID)]
		info := runNode{name: n.Name, key: spec.Key, mockStatus: exec.DefaultMockStatus}
		// A board written by hand may omit the display name; the frontend
		// falls back to the id when it loads one, so the log rows do too.
		if info.name == "" {
			info.name = n.ID
		}
		if spec.Mock != nil && spec.Mock.Status != 0 {
			info.mockStatus = spec.Mock.Status
		}
		nodes[core.NodeID(n.ID)] = info
	}
	return runContext{projectID: projectID, boardID: boardID, nodes: nodes}
}

// event builds the DTO for one engine event.
func (c runContext) event(e exec.Event) runEvent {
	out := runEvent{
		Kind:      string(e.Kind),
		RunID:     e.RunID,
		ProjectID: c.projectID,
		BoardID:   c.boardID,
		Node:      string(e.Node),
	}
	switch e.Kind {
	case exec.EventRunStarted:
		out.Nodes = make([]string, len(e.Nodes))
		for i, id := range e.Nodes {
			out.Nodes[i] = string(id)
		}
	case exec.EventNodeStarted:
		out.Iteration = iterationOf(e.Iteration)
	case exec.EventNodeFinished:
		out.Iteration = iterationOf(e.Iteration)
		out.Status = string(e.Status)
		out.Log = c.logEntry(e)
		out.Capture = capture(e)
		if e.Record != nil && e.Record.Err != "" {
			out.Note = c.note(e.Record.Err, e.Record.Node, e.Record.Type)
		}
	case exec.EventLoopProgress:
		out.Progress = &runProgress{Done: e.Done, Total: e.Total}
	case exec.EventRunFinished:
		out.Error = c.rewriteNodeIDs(strings.TrimPrefix(e.Err, execErrorPrefix))
		out.Cancelled = e.Cancelled
	}
	return out
}

// result is the terminal reconciliation the frontend applies over whatever the
// event stream delivered.
func (c runContext) result(runID string, r *exec.Result) RunResult {
	out := RunResult{
		RunID:     runID,
		ProjectID: c.projectID,
		BoardID:   c.boardID,
		Statuses:  make(map[string]string, len(r.Statuses)),
		Cancelled: r.Cancelled,
	}
	for id, status := range r.Statuses {
		out.Statuses[string(id)] = string(status)
	}
	// Later records win, so a loop child's note is the one from the iteration
	// that actually failed.
	for _, rec := range r.Records {
		if rec.Err == "" {
			continue
		}
		if out.Notes == nil {
			out.Notes = make(map[string]string)
		}
		out.Notes[string(rec.Node)] = c.note(rec.Err, rec.Node, rec.Type)
	}
	return out
}

// logEntry builds the run-log row for a finished node. A skip produces a
// status but no record, and therefore no row.
func (c runContext) logEntry(e exec.Event) *runLogEntry {
	rec := e.Record
	if rec == nil {
		return nil
	}
	info := c.nodes[rec.Node]
	entry := &runLogEntry{
		Kind:       string(rec.Type),
		ID:         logRowID(e.RunID, rec.Node, rec.Iteration),
		RunID:      e.RunID,
		Time:       rec.Time.Format(logTimeLayout),
		Node:       info.name,
		NodeID:     string(rec.Node),
		DurationMs: int(rec.Duration.Milliseconds()),
		Iteration:  iterationOf(rec.Iteration),
		Error:      c.rewriteNodeIDs(strings.TrimPrefix(rec.Err, execErrorPrefix)),
	}
	switch rec.Type {
	case core.NodeTypeHTTP:
		fillHTTPRow(entry, rec.HTTP)
	case core.NodeTypeTransform:
		inputs := rec.InputNodes
		if inputs == nil {
			inputs = []string{}
		}
		entry.InputNodes = &inputs
		entry.Output = outputJSON(rec)
	case core.NodeTypeMock:
		status := info.mockStatus
		entry.Status = &status
		entry.Output = outputJSON(rec)
	case core.NodeTypeFor:
		iterations := rec.Iterations
		entry.Iterations = &iterations
	}
	return entry
}

// fillHTTPRow copies the call detail onto the row. A detail is absent only
// when the request could not be built, so nothing was ever attempted; a
// transport failure still has one, which is what makes a connection refusal
// name the URL it tried.
func fillHTTPRow(entry *runLogEntry, detail *exec.CallDetail) {
	if detail == nil {
		return
	}
	entry.Method = detail.Method
	entry.URL = detail.URL
	entry.Request = detail.RequestBody
	entry.Response = detail.ResponseBody
	if detail.Status != 0 {
		status := detail.Status
		entry.Status = &status
	}
}

// capture is the node's output in the shape the frontend persists. Failures
// and skips produce none, so a failed re-run leaves the previous capture in
// place rather than blanking the picker.
func capture(e exec.Event) *RunCapture {
	if e.Output == nil || e.Record == nil {
		return nil
	}
	out := &RunCapture{
		Status:    e.Output.Status,
		Body:      e.Output.Body,
		At:        e.Record.Time.Add(e.Record.Duration).UTC().Format(captureTimeLayout),
		Truncated: e.Output.Truncated,
	}
	if len(e.Output.Header) > 0 {
		out.Headers = make(map[string]string, len(e.Output.Header))
		for name := range e.Output.Header {
			out.Headers[name] = e.Output.Header.Get(name)
		}
	}
	return out
}

// note is the one-line message the canvas card shows. The card renders it in a
// truncating span with no tooltip, so the engine prefix and the `node "id": `
// echo — the card already names the node — are stripped before the id rewrite.
func (c runContext) note(message string, id core.NodeID, kind core.NodeType) string {
	message = strings.TrimPrefix(message, execErrorPrefix)
	for _, prefix := range []string{
		fmt.Sprintf("%s node %q: ", kind, id),
		fmt.Sprintf("node %q: ", id),
	} {
		if rest, ok := strings.CutPrefix(message, prefix); ok {
			message = rest
			break
		}
	}
	return c.rewriteNodeIDs(message)
}

// quotedToken matches the `"…"` an engine error puts a node id in.
var quotedToken = regexp.MustCompile(`"[^"]*"`)

// rewriteNodeIDs replaces quoted node ids with node keys: core/binding is
// deliberately key-free and prints raw ids, so without this a log row reads
// `node "n-8f2a1c" has not produced an output`. One pass over the quoted
// tokens rather than a replace per node, so a key that happens to equal
// another node's id cannot be rewritten twice.
func (c runContext) rewriteNodeIDs(message string) string {
	if message == "" || !strings.Contains(message, `"`) {
		return message
	}
	return quotedToken.ReplaceAllStringFunc(message, func(token string) string {
		inner, err := strconv.Unquote(token)
		if err != nil {
			return token
		}
		key := c.nodes[core.NodeID(inner)].key
		if key == "" || key == inner {
			return token
		}
		return strconv.Quote(key)
	})
}

// logRowID identifies one row. Iteration runs need the suffix to stay unique.
func logRowID(runID string, node core.NodeID, iteration int) string {
	if iteration < 0 {
		return fmt.Sprintf("%s-%s", runID, node)
	}
	return fmt.Sprintf("%s-%s-%d", runID, node, iteration)
}

// iterationOf maps the engine's -1 (outside any loop) to an absent field.
func iterationOf(iteration int) *int {
	if iteration < 0 {
		return nil
	}
	return &iteration
}

// outputJSON renders a produced body for the row's Output pane. A successful
// node that produced a JSON null renders "null", which is why the failure test
// is the record's error rather than a nil body.
func outputJSON(rec *exec.Record) string {
	if rec.Err != "" {
		return ""
	}
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	// '<', '>' and '&' are ordinary body bytes here, not markup; the default
	// escaping would show < in a row meant to read like the payload.
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(rec.Output); err != nil {
		return ""
	}
	return strings.TrimSuffix(buf.String(), "\n")
}
