package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"

	"cascade/store"
)

// TestDoneWhenScenario walks plan 01's done-when criteria through the same
// App methods the frontend calls: two projects with different sources,
// environments, and credentials; switching swaps the whole bundle; an app
// "restart" (fresh Manager/App over the same root) reopens the last-open
// project with identical state; deleting a project leaves no files and no
// index entry.
func TestDoneWhenScenario(t *testing.T) {
	root := t.TempDir()
	manager := store.NewManager(root, nil)
	if err := bootstrapDefaultProject(manager); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	app := NewApp(manager)

	projects, err := app.ListProjects()
	if err != nil || len(projects) != 1 {
		t.Fatalf("projects = %+v, %v; want the bootstrapped Default", projects, err)
	}
	defaultID := projects[0].ID

	// Second project with its own source, environments, and credentials.
	payments, err := app.CreateProject("Payments")
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	p, err := manager.Project(payments.ID)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if err := p.SaveSource(store.Source{ID: "paysrc", Title: "payments-api", Operations: []store.Operation{
		{Ref: "charge", Method: "POST", Path: "/v2/charges", Summary: "Create a charge", Group: "Charges"},
	}}); err != nil {
		t.Fatalf("SaveSource: %v", err)
	}
	if err := p.SaveEnvironments([]store.Environment{{Name: "pay-staging", BaseURL: "https://pay.example.com"}}); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}
	if err := p.SaveCredentials([]store.Credential{{Name: "pay-admin", Kind: "bearer"}}); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}

	// Switching projects swaps the working set.
	defBundle, err := app.OpenProject(defaultID)
	if err != nil {
		t.Fatalf("OpenProject(default): %v", err)
	}
	payBundle, err := app.OpenProject(payments.ID)
	if err != nil {
		t.Fatalf("OpenProject(payments): %v", err)
	}
	if defBundle.Sources[0].Title == payBundle.Sources[0].Title {
		t.Fatal("both projects report the same source")
	}
	if len(payBundle.Environments) != 1 || payBundle.Environments[0].Name != "pay-staging" {
		t.Fatalf("payments environments = %+v", payBundle.Environments)
	}
	if len(payBundle.Boards) != 1 || len(payBundle.Boards[0].Nodes) != 0 {
		t.Fatalf("payments boards = %+v; want one empty Main board", payBundle.Boards)
	}

	// Edit the Payments board through the binding the canvas uses.
	board := payBundle.Boards[0]
	board.Nodes = append(board.Nodes, store.BoardNode{ID: "charge-1", Type: "http", Name: "Create Charge",
		Data: map[string]any{"method": "POST", "path": "/v2/charges"}})
	board.Layout.Positions["charge-1"] = store.Position{X: 100, Y: 200}
	if err := app.SaveBoard(payments.ID, board); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}

	// "Restart": a fresh Manager and App over the same root.
	manager2 := store.NewManager(root, nil)
	if err := bootstrapDefaultProject(manager2); err != nil {
		t.Fatalf("bootstrap after restart: %v", err)
	}
	app2 := NewApp(manager2)
	projects2, err := app2.ListProjects()
	if err != nil || len(projects2) != 2 {
		t.Fatalf("projects after restart = %+v, %v; want 2 (bootstrap must not re-seed)", projects2, err)
	}
	// The frontend reopens the entry with the greatest lastOpenedAt.
	lastOpen := projects2[0]
	for _, info := range projects2[1:] {
		if info.LastOpenedAt > lastOpen.LastOpenedAt {
			lastOpen = info
		}
	}
	if lastOpen.ID != payments.ID {
		t.Fatalf("last-opened after restart = %q, want Payments (%q)", lastOpen.ID, payments.ID)
	}
	reopened, err := app2.OpenProject(lastOpen.ID)
	if err != nil {
		t.Fatalf("OpenProject after restart: %v", err)
	}
	rb := reopened.Boards[0]
	if len(rb.Nodes) != 1 || rb.Nodes[0].ID != "charge-1" || rb.Layout.Positions["charge-1"] != (store.Position{X: 100, Y: 200}) {
		t.Fatalf("reopened board lost state: %+v", rb)
	}
	if rb.Nodes[0].Data["path"] != "/v2/charges" {
		t.Fatalf("reopened node data = %+v", rb.Nodes[0].Data)
	}

	// Deleting a project leaves no files and no index entry.
	payDir := filepath.Join(root, "projects", payments.ID)
	if err := app2.DeleteProject(payments.ID); err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}
	if _, err := os.Stat(payDir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("project directory survived delete: %v", err)
	}
	projects3, _ := app2.ListProjects()
	if len(projects3) != 1 || projects3[0].ID != defaultID {
		t.Fatalf("index after delete = %+v; want only Default", projects3)
	}
}
