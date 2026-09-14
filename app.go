package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"sync"

	"cascade/core/binding"
	"cascade/core/httpcall"
	"cascade/core/transform"
	"cascade/store"
)

// App is the Wails-bound application shell. Bound methods take and return
// JSON-serializable store types only; no engine types leak to the frontend.
type App struct {
	ctx   context.Context
	store *store.Manager
	// client is shared by every outbound call: httpcall.Do allocates one per
	// call when handed nil, which throws away connection reuse across the
	// dozens of requests a single board run makes.
	client *http.Client

	// One run at a time, guarded server-side because the frontend's own
	// isRunning flag does not survive a reload.
	runMu     sync.Mutex
	runID     string
	runCancel context.CancelFunc
	// emitRunEvent publishes one run event to the frontend; tests replace it
	// to capture the DTOs without a Wails runtime.
	emitRunEvent func(runEvent)
}

// NewApp creates the application shell over the given project store.
func NewApp(manager *store.Manager) *App {
	a := &App{store: manager, client: &http.Client{Timeout: httpcall.DefaultTimeout}}
	a.emitRunEvent = a.emitToRuntime
	return a
}

// startup is called when the app starts. The context is saved so we can call
// the runtime methods.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// ProjectBundle is everything the frontend needs to render a freshly opened
// project, fetched in one round trip.
type ProjectBundle struct {
	Project      store.ProjectMeta   `json:"project"`
	Sources      []store.Source      `json:"sources"`
	Environments []store.Environment `json:"environments"`
	Credentials  []store.Credential  `json:"credentials"`
	Boards       []store.Board       `json:"boards"`
	Collections  []store.Collection  `json:"collections"`
}

// ListProjects returns the project index.
func (a *App) ListProjects() ([]store.ProjectInfo, error) {
	return a.store.ListProjects()
}

// CreateProject creates a new, empty project.
func (a *App) CreateProject(name string) (store.ProjectInfo, error) {
	return a.store.CreateProject(name)
}

// RenameProject renames a project; its id and files stay put.
func (a *App) RenameProject(id, name string) (store.ProjectInfo, error) {
	return a.store.RenameProject(id, name)
}

// DeleteProject removes a project's files, index entry, and keychain entries.
// Keychain leftovers are logged as a warning, not surfaced as failure — the
// project itself is already gone (see store.SecretCleanupError).
func (a *App) DeleteProject(id string) error {
	err := a.store.DeleteProject(id)
	var cleanup *store.SecretCleanupError
	if errors.As(err, &cleanup) {
		log.Printf("warning: %v", cleanup)
		return nil
	}
	return err
}

// OpenProject marks the project as last-opened and returns its full working
// set.
func (a *App) OpenProject(id string) (ProjectBundle, error) {
	p, err := a.store.OpenProject(id)
	if err != nil {
		return ProjectBundle{}, err
	}
	meta, err := p.Meta()
	if err != nil {
		return ProjectBundle{}, err
	}
	sources, err := p.Sources()
	if err != nil {
		return ProjectBundle{}, err
	}
	environments, err := p.Environments()
	if err != nil {
		return ProjectBundle{}, err
	}
	credentials, err := p.Credentials()
	if err != nil {
		return ProjectBundle{}, err
	}
	boards, err := p.Boards()
	if err != nil {
		return ProjectBundle{}, err
	}
	collections, err := p.Collections()
	if err != nil {
		return ProjectBundle{}, err
	}
	return ProjectBundle{
		Project:      meta,
		Sources:      sources,
		Environments: environments,
		Credentials:  credentials,
		Boards:       boards,
		Collections:  collections,
	}, nil
}

// ScriptUpstream is one upstream output as the frontend captures it,
// handed to a transform script run.
type ScriptUpstream struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	Body    any               `json:"body"`
}

// ScriptRunRequest is one transform-script execution against captured
// upstream responses (plan 06 T4/T5): both the inspector's Test button and
// the interim frontend run simulation call this. Nodes is keyed by node key
// (scripts read `nodes.<key>`); Res is the single direct upstream, when
// there is exactly one.
type ScriptRunRequest struct {
	Script string                    `json:"script"`
	Nodes  map[string]ScriptUpstream `json:"nodes"`
	Res    *ScriptUpstream           `json:"res,omitempty"`
	Index  int                       `json:"index"`
	// Item is the each-mode loop element (plan 09); HasItem gates it so a
	// stray `item` read outside a loop stays undefined.
	Item    any  `json:"item,omitempty"`
	HasItem bool `json:"hasItem,omitempty"`
}

// RunTransformScript executes one transform script in the goja sandbox and
// returns the result body. Script errors (throw, timeout, output cap,
// non-serializable return) surface as the rejected promise's message.
func (a *App) RunTransformScript(req ScriptRunRequest) (any, error) {
	in := transform.Input{
		Nodes:   make(map[string]*binding.Output, len(req.Nodes)),
		Index:   req.Index,
		Item:    req.Item,
		HasItem: req.HasItem,
	}
	for key, up := range req.Nodes {
		in.Nodes[key] = up.output()
	}
	if req.Res != nil {
		in.Res = req.Res.output()
	}
	out, err := transform.Execute(transform.Spec{Mode: transform.ModeScript, Script: req.Script}, in)
	if err != nil {
		return nil, err
	}
	return out.Body, nil
}

func (u ScriptUpstream) output() *binding.Output {
	header := make(http.Header, len(u.Headers))
	for name, value := range u.Headers {
		header.Set(name, value)
	}
	return &binding.Output{Status: u.Status, Header: header, Body: u.Body}
}

// SaveBoard persists one board (graph + canvas layout) of a project.
func (a *App) SaveBoard(projectID string, board store.Board) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SaveBoard(board)
}

// SetCaptureResponses stores whether response bodies may be written into this
// project's board files. It gates only what reaches disk: a run's bodies still
// travel to the frontend and stay in memory for the session either way, so
// bindings, the For each-source and the transform Test button are unaffected
// until the board is reopened.
func (a *App) SetCaptureResponses(projectID string, capture bool) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SetCaptureResponses(capture)
}

// SaveCollection persists one request collection of a project (plan 08 B5).
func (a *App) SaveCollection(projectID string, collection store.Collection) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SaveCollection(collection)
}

// DeleteCollection removes one request collection. Boards referencing its
// requests keep working: a requestRef is provenance only (plan 08 B3).
func (a *App) DeleteCollection(projectID, id string) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.DeleteCollection(id)
}
