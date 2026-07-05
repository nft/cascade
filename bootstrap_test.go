package main

import (
	"testing"

	"cascade/store"
)

func TestBootstrapDefaultProjectFirstLaunch(t *testing.T) {
	m := store.NewManager(t.TempDir(), nil)
	if err := bootstrapDefaultProject(m); err != nil {
		t.Fatalf("bootstrapDefaultProject: %v", err)
	}

	projects, err := m.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 1 || projects[0].Name != defaultProjectName {
		t.Fatalf("projects = %+v; want one %q project", projects, defaultProjectName)
	}
	if projects[0].LastOpenedAt == "" {
		t.Fatal("Default project should be stamped as last-opened")
	}

	p, err := m.Project(projects[0].ID)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	meta, err := p.Meta()
	if err != nil {
		t.Fatalf("Meta: %v", err)
	}
	if meta.Defaults.Environment != "staging" || meta.Defaults.Credential != "staging-admin" {
		t.Fatalf("defaults = %+v", meta.Defaults)
	}

	sources, err := p.Sources()
	if err != nil || len(sources) != 1 {
		t.Fatalf("sources = %+v, %v; want exactly one", sources, err)
	}
	if sources[0].Title != "demo-api" || len(sources[0].Operations) != 8 {
		t.Fatalf("seed source = %q with %d operations", sources[0].Title, len(sources[0].Operations))
	}
	if envs, err := p.Environments(); err != nil || len(envs) != 3 {
		t.Fatalf("environments = %+v, %v; want 3", envs, err)
	}
	if creds, err := p.Credentials(); err != nil || len(creds) != 3 {
		t.Fatalf("credentials = %+v, %v; want 3", creds, err)
	}

	boards, err := p.Boards()
	if err != nil || len(boards) != 1 {
		t.Fatalf("boards = %+v, %v; want exactly one (the seeded Main board)", boards, err)
	}
	board := boards[0]
	if board.Name != store.DefaultBoardName || len(board.Nodes) != 5 || len(board.Edges) != 4 {
		t.Fatalf("seed board = %q with %d nodes / %d edges", board.Name, len(board.Nodes), len(board.Edges))
	}
	if len(board.Layout.Positions) != len(board.Nodes) {
		t.Fatalf("layout has %d positions for %d nodes", len(board.Layout.Positions), len(board.Nodes))
	}
}

func TestBootstrapSkipsWhenProjectsExist(t *testing.T) {
	m := store.NewManager(t.TempDir(), nil)
	if _, err := m.CreateProject("Existing"); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	if err := bootstrapDefaultProject(m); err != nil {
		t.Fatalf("bootstrapDefaultProject: %v", err)
	}
	projects, _ := m.ListProjects()
	if len(projects) != 1 || projects[0].Name != "Existing" {
		t.Fatalf("projects = %+v; bootstrap must not add a project when one exists", projects)
	}
}
