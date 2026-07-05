package main

import (
	"context"
	"errors"
	"log"

	"cascade/store"
)

// App is the Wails-bound application shell. Bound methods take and return
// JSON-serializable store types only; no engine types leak to the frontend.
type App struct {
	ctx   context.Context
	store *store.Manager
}

// NewApp creates the application shell over the given project store.
func NewApp(manager *store.Manager) *App {
	return &App{store: manager}
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
	return ProjectBundle{
		Project:      meta,
		Sources:      sources,
		Environments: environments,
		Credentials:  credentials,
		Boards:       boards,
	}, nil
}

// SaveBoard persists one board (graph + canvas layout) of a project.
func (a *App) SaveBoard(projectID string, board store.Board) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SaveBoard(board)
}
