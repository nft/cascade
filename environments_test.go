package main

import (
	"testing"

	"cascade/store"
)

var (
	envLocal   = store.Environment{Name: "local", BaseURL: "http://localhost:8080"}
	envStaging = store.Environment{Name: "staging", BaseURL: "https://staging.example.com/v1"}
)

// newEnvApp builds an App over a temp store holding one project created the
// way a user creates one — through CreateProject, which seeds nothing.
func newEnvApp(t *testing.T) (*App, string) {
	t.Helper()
	app := NewApp(store.NewManager(t.TempDir(), nil))
	info, err := app.CreateProject("Envs")
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	return app, info.ID
}

func openProject(t *testing.T, app *App, projectID string) ProjectBundle {
	t.Helper()
	bundle, err := app.OpenProject(projectID)
	if err != nil {
		t.Fatalf("OpenProject: %v", err)
	}
	return bundle
}

// The premise the editor exists to fix: a project the user created has nothing
// to run against, so every node it holds is born with an empty target.
func TestCreatedProjectHasNoEnvironmentsAndNoDefaults(t *testing.T) {
	app, projectID := newEnvApp(t)
	bundle := openProject(t, app, projectID)
	if len(bundle.Environments) != 0 {
		t.Errorf("environments = %+v, want none", bundle.Environments)
	}
	if bundle.Project.Defaults != (store.Defaults{}) {
		t.Errorf("defaults = %+v, want zero", bundle.Project.Defaults)
	}
}

func TestSaveEnvironmentsReplacesTheList(t *testing.T) {
	app, projectID := newEnvApp(t)
	if err := app.SaveEnvironments(projectID, []store.Environment{envLocal, envStaging}); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}
	if got := openProject(t, app, projectID).Environments; len(got) != 2 || got[0] != envLocal || got[1] != envStaging {
		t.Fatalf("environments = %+v, want %+v", got, []store.Environment{envLocal, envStaging})
	}

	// Replaces rather than merges — deleting a row is a save of the shorter
	// list, so a merge would make delete impossible.
	if err := app.SaveEnvironments(projectID, []store.Environment{envStaging}); err != nil {
		t.Fatalf("SaveEnvironments(shorter): %v", err)
	}
	if got := openProject(t, app, projectID).Environments; len(got) != 1 || got[0] != envStaging {
		t.Errorf("environments = %+v, want only %+v", got, envStaging)
	}
}

func TestSetProjectDefaultsRoundTrips(t *testing.T) {
	app, projectID := newEnvApp(t)
	defaults := store.Defaults{Environment: envLocal.Name, Credential: "admin"}
	if err := app.SetProjectDefaults(projectID, defaults); err != nil {
		t.Fatalf("SetProjectDefaults: %v", err)
	}
	if got := openProject(t, app, projectID).Project.Defaults; got != defaults {
		t.Errorf("defaults = %+v, want %+v", got, defaults)
	}

	// Clearing is what deleting the default environment does, so the zero
	// value has to survive the round trip as a value and not read as "absent".
	if err := app.SetProjectDefaults(projectID, store.Defaults{}); err != nil {
		t.Fatalf("SetProjectDefaults(zero): %v", err)
	}
	if got := openProject(t, app, projectID).Project.Defaults; got != (store.Defaults{}) {
		t.Errorf("defaults = %+v, want zero", got)
	}
}

func TestEnvironmentWritesRejectAnUnknownProject(t *testing.T) {
	app, _ := newEnvApp(t)
	if err := app.SaveEnvironments("no-such-project", []store.Environment{envLocal}); err == nil {
		t.Error("SaveEnvironments on an unknown project: want an error")
	}
	if err := app.SetProjectDefaults("no-such-project", store.Defaults{}); err == nil {
		t.Error("SetProjectDefaults on an unknown project: want an error")
	}
}
