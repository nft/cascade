package main

// Shared fixtures for the run bridge tests: an in-memory secret store, board
// builders that write node data the way the frontend does, and a collector for
// the DTOs the bridge publishes.

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"cascade/core/exec"
	"cascade/store"
)

// stubSecrets is an in-memory SecretStore: run tests need credentials that
// actually resolve, without touching the OS keychain.
type stubSecrets map[string]string

func (s stubSecrets) SetSecret(projectID, name, value string) error {
	s[projectID+"/"+name] = value
	return nil
}

func (s stubSecrets) GetSecret(projectID, name string) (string, error) {
	value, ok := s[projectID+"/"+name]
	if !ok {
		return "", store.ErrSecretNotFound
	}
	return value, nil
}

func (s stubSecrets) DeleteSecret(projectID, name string) error {
	delete(s, projectID+"/"+name)
	return nil
}

func (s stubSecrets) DeleteProjectSecrets(string, []string) ([]string, error) { return nil, nil }

// newRunApp builds an app over a temp store with the given environments and
// credentials, and returns the project the boards run against.
func newRunApp(t *testing.T, environments map[string]string, credentials ...store.Credential) (*App, string, stubSecrets) {
	t.Helper()
	secrets := stubSecrets{}
	manager := store.NewManager(t.TempDir(), secrets)
	if err := bootstrapDefaultProject(manager); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	app := NewApp(manager)
	projectID := defaultProjectID(t, app)
	p, err := manager.Project(projectID)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	var envs []store.Environment
	for name, base := range environments {
		envs = append(envs, store.Environment{Name: name, BaseURL: base})
	}
	if err := p.SaveEnvironments(envs); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}
	if len(credentials) > 0 {
		if err := p.SaveCredentials(credentials); err != nil {
			t.Fatalf("SaveCredentials: %v", err)
		}
	}
	return app, projectID, secrets
}

// httpNodeSpec builds one http BoardNode's opaque data the way the frontend
// writes it.
type httpNodeSpec struct {
	id, key, name       string
	method, path        string
	environment, origin string
	credential          string
	fields              []map[string]any
	parent              string
}

func (h httpNodeSpec) node() store.BoardNode {
	data := map[string]any{"key": h.key, "method": h.method, "path": h.path}
	for key, value := range map[string]string{
		"environment": h.environment,
		"origin":      h.origin,
		"credential":  h.credential,
	} {
		if value != "" {
			data[key] = value
		}
	}
	if len(h.fields) > 0 {
		rows := make([]any, len(h.fields))
		for i, f := range h.fields {
			rows[i] = f
		}
		data["fields"] = rows
	}
	return store.BoardNode{ID: h.id, Type: "http", Name: h.name, Parent: h.parent, Data: data}
}

func literalField(key, value string) map[string]any {
	return map[string]any{"key": key, "source": "literal", "value": value}
}

func bindingField(key, nodeID, path string) map[string]any {
	return map[string]any{
		"key":    key,
		"source": "binding",
		"ref":    map[string]any{"nodeId": nodeID, "path": path},
	}
}

func templateField(key, text string) map[string]any {
	return map[string]any{"key": key, "source": "template", "value": text}
}

// eventCollector captures published DTOs. The lock is real: the drain
// goroutine publishes while the test reads during cancellation tests.
type eventCollector struct {
	mu     sync.Mutex
	events []runEvent
}

func (c *eventCollector) add(e runEvent) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.events = append(c.events, e)
}

func (c *eventCollector) all() []runEvent {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]runEvent(nil), c.events...)
}

func (c *eventCollector) matches(match func(runEvent) bool) bool {
	for _, e := range c.all() {
		if match(e) {
			return true
		}
	}
	return false
}

func (c *eventCollector) waitFor(t *testing.T, what string, match func(runEvent) bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if c.matches(match) {
			return
		}
		time.Sleep(time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", what)
}

// statuses collapses the stream to each node's last reported outcome.
func (c *eventCollector) statuses() map[string]string {
	out := map[string]string{}
	for _, e := range c.all() {
		if e.Kind == string(exec.EventNodeFinished) {
			out[e.Node] = e.Status
		}
	}
	return out
}

func (c *eventCollector) logs() []runLogEntry {
	var rows []runLogEntry
	for _, e := range c.all() {
		if e.Log != nil {
			rows = append(rows, *e.Log)
		}
	}
	return rows
}

// finishedFor returns the node.finished event for one node.
func (c *eventCollector) finishedFor(t *testing.T, nodeID string) runEvent {
	t.Helper()
	for _, e := range c.all() {
		if e.Kind == string(exec.EventNodeFinished) && e.Node == nodeID {
			return e
		}
	}
	t.Fatalf("no node.finished for node %q", nodeID)
	return runEvent{}
}

func (c *eventCollector) logFor(t *testing.T, nodeID string) runLogEntry {
	t.Helper()
	for _, row := range c.logs() {
		if row.NodeID == nodeID {
			return row
		}
	}
	t.Fatalf("no log row for node %q", nodeID)
	return runLogEntry{}
}

// runBoard executes a board with a collector attached.
func runBoard(t *testing.T, app *App, projectID string, req RunRequest) (*eventCollector, RunResult, error) {
	t.Helper()
	collector := &eventCollector{}
	app.emitRunEvent = collector.add
	result, err := app.RunBoard(projectID, req)
	return collector, result, err
}

// jsonServer replies to each path with the canned body, recording every call.
type jsonServer struct {
	mu      sync.Mutex
	calls   []*http.Request
	bodies  []string
	replies map[string]jsonReply
}

type jsonReply struct {
	status int
	body   string
}

func newJSONServer(replies map[string]jsonReply) (*httptest.Server, *jsonServer) {
	rec := &jsonServer{replies: replies}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		rec.mu.Lock()
		rec.calls = append(rec.calls, r.Clone(context.Background()))
		rec.bodies = append(rec.bodies, string(body))
		reply, ok := rec.replies[r.URL.Path]
		rec.mu.Unlock()
		if !ok {
			reply = jsonReply{status: http.StatusCreated, body: `{"id":"generic"}`}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(reply.status)
		_, _ = w.Write([]byte(reply.body))
	}))
	return srv, rec
}

func (s *jsonServer) seen() ([]*http.Request, []string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]*http.Request(nil), s.calls...), append([]string(nil), s.bodies...)
}
