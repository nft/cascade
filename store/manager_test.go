package store

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestManager(t *testing.T) *Manager {
	t.Helper()
	return NewManager(t.TempDir(), nil)
}

func mustCreate(t *testing.T, m *Manager, name string) ProjectInfo {
	t.Helper()
	info, err := m.CreateProject(name)
	if err != nil {
		t.Fatalf("CreateProject(%q): %v", name, err)
	}
	return info
}

func TestListProjectsFirstLaunchIsEmpty(t *testing.T) {
	m := newTestManager(t)
	projects, err := m.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 0 {
		t.Fatalf("want empty index on first launch, got %v", projects)
	}
}

func TestCreateProjectProvisionsFilesAndIndex(t *testing.T) {
	m := newTestManager(t)
	info := mustCreate(t, m, "Payments")

	projects, err := m.ListProjects()
	if err != nil {
		t.Fatalf("ListProjects: %v", err)
	}
	if len(projects) != 1 || projects[0].ID != info.ID || projects[0].Name != "Payments" {
		t.Fatalf("index = %+v, want one entry for %q", projects, info.ID)
	}

	p, err := m.Project(info.ID)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	meta, err := p.Meta()
	if err != nil {
		t.Fatalf("Meta: %v", err)
	}
	if meta.ID != info.ID || meta.Name != "Payments" || meta.FormatVersion != ProjectFormatVersion || meta.CreatedAt == "" {
		t.Fatalf("meta = %+v", meta)
	}

	envs, err := p.Environments()
	if err != nil || len(envs) != 0 {
		t.Fatalf("Environments = %v, %v; want empty", envs, err)
	}
	creds, err := p.Credentials()
	if err != nil || len(creds) != 0 {
		t.Fatalf("Credentials = %v, %v; want empty", creds, err)
	}
	boards, err := p.Boards()
	if err != nil {
		t.Fatalf("Boards: %v", err)
	}
	if len(boards) != 1 || boards[0].Name != DefaultBoardName || len(boards[0].Nodes) != 0 {
		t.Fatalf("boards = %+v; want one empty %q board", boards, DefaultBoardName)
	}
}

func TestProjectIDsAreRandomNotNameDerived(t *testing.T) {
	m := newTestManager(t)
	a := mustCreate(t, m, "Same Name")
	b := mustCreate(t, m, "Same Name")

	for _, info := range []ProjectInfo{a, b} {
		if len(info.ID) != idLength {
			t.Fatalf("id %q: want length %d", info.ID, idLength)
		}
		for _, r := range info.ID {
			if !strings.ContainsRune(idAlphabet, r) {
				t.Fatalf("id %q contains %q outside the id alphabet", info.ID, r)
			}
		}
		if strings.Contains(strings.ToLower(info.Path), "same") {
			t.Fatalf("path %q leaks the project name", info.Path)
		}
	}
	if a.ID == b.ID {
		t.Fatalf("two projects share id %q", a.ID)
	}
}

func TestCreateProjectRejectsEmptyName(t *testing.T) {
	m := newTestManager(t)
	if _, err := m.CreateProject("   "); err == nil {
		t.Fatal("want error for blank name")
	}
}

func TestOpenProjectStampsLastOpenedAt(t *testing.T) {
	m := newTestManager(t)
	info := mustCreate(t, m, "A")
	if info.LastOpenedAt != "" {
		t.Fatalf("fresh project already has lastOpenedAt %q", info.LastOpenedAt)
	}
	if _, err := m.OpenProject(info.ID); err != nil {
		t.Fatalf("OpenProject: %v", err)
	}
	projects, _ := m.ListProjects()
	if projects[0].LastOpenedAt == "" {
		t.Fatal("OpenProject did not stamp lastOpenedAt")
	}
}

func TestOpenProjectUnknownID(t *testing.T) {
	m := newTestManager(t)
	if _, err := m.OpenProject("nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

func TestRenameProjectUpdatesIndexAndMetaButNotPath(t *testing.T) {
	m := newTestManager(t)
	info := mustCreate(t, m, "Before")

	renamed, err := m.RenameProject(info.ID, "After")
	if err != nil {
		t.Fatalf("RenameProject: %v", err)
	}
	if renamed.Name != "After" || renamed.Path != info.Path {
		t.Fatalf("renamed = %+v; want name After with unchanged path %q", renamed, info.Path)
	}
	projects, _ := m.ListProjects()
	if projects[0].Name != "After" {
		t.Fatalf("index name = %q", projects[0].Name)
	}
	p, _ := m.Project(info.ID)
	meta, err := p.Meta()
	if err != nil || meta.Name != "After" {
		t.Fatalf("meta = %+v, %v", meta, err)
	}
}

// recordingSecrets fakes the keychain to observe cleanup calls.
type recordingSecrets struct {
	NoopSecretStore
	deleted  []string
	names    []string
	leftover []string
	err      error
}

func (r *recordingSecrets) DeleteProjectSecrets(projectID string, names []string) ([]string, error) {
	r.deleted = append(r.deleted, projectID)
	r.names = append(r.names, names...)
	return r.leftover, r.err
}

func TestDeleteProjectRemovesDirIndexAndSecrets(t *testing.T) {
	secrets := &recordingSecrets{}
	m := NewManager(t.TempDir(), secrets)
	keep := mustCreate(t, m, "Keep")
	doomed := mustCreate(t, m, "Doomed")
	p, _ := m.Project(doomed.ID)
	dir := p.Dir()
	if err := p.SaveCredentials([]Credential{{Name: "staging-admin", Kind: "bearer"}}); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}

	if err := m.DeleteProject(doomed.ID); err != nil {
		t.Fatalf("DeleteProject: %v", err)
	}
	if _, err := os.Stat(dir); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("project dir still exists: %v", err)
	}
	projects, _ := m.ListProjects()
	if len(projects) != 1 || projects[0].ID != keep.ID {
		t.Fatalf("index = %+v; want only %q", projects, keep.ID)
	}
	if len(secrets.deleted) != 1 || secrets.deleted[0] != doomed.ID {
		t.Fatalf("secrets cleanup calls = %v", secrets.deleted)
	}
	// The credential names were read before the dir vanished, so the
	// keychain cleanup knows which accounts to remove.
	if len(secrets.names) != 1 || secrets.names[0] != "staging-admin" {
		t.Fatalf("secrets cleanup names = %v", secrets.names)
	}
	if _, err := m.Project(doomed.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("deleted project still resolves: %v", err)
	}
}

func TestDeleteProjectSurfacesKeychainLeftoversAsTypedError(t *testing.T) {
	secrets := &recordingSecrets{leftover: []string{"p1/staging-admin"}}
	m := NewManager(t.TempDir(), secrets)
	info := mustCreate(t, m, "A")

	err := m.DeleteProject(info.ID)
	var cleanup *SecretCleanupError
	if !errors.As(err, &cleanup) {
		t.Fatalf("err = %v, want *SecretCleanupError", err)
	}
	// The delete itself still happened.
	if projects, _ := m.ListProjects(); len(projects) != 0 {
		t.Fatalf("index = %+v; want empty", projects)
	}
}

func TestReopenAcrossManagers(t *testing.T) {
	root := t.TempDir()
	m1 := NewManager(root, nil)
	info, err := m1.CreateProject("Persisted")
	if err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	p1, _ := m1.OpenProject(info.ID)
	if err := p1.SaveEnvironments([]Environment{{Name: "staging", BaseURL: "https://s.example.com"}}); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}

	// A fresh Manager over the same root simulates an app restart.
	m2 := NewManager(root, nil)
	projects, err := m2.ListProjects()
	if err != nil || len(projects) != 1 || projects[0].Name != "Persisted" {
		t.Fatalf("projects = %+v, %v", projects, err)
	}
	p2, err := m2.OpenProject(info.ID)
	if err != nil {
		t.Fatalf("OpenProject: %v", err)
	}
	envs, err := p2.Environments()
	if err != nil || len(envs) != 1 || envs[0].Name != "staging" {
		t.Fatalf("envs = %+v, %v", envs, err)
	}
}

func TestNoTempFilesLeftBehind(t *testing.T) {
	root := t.TempDir()
	m := NewManager(root, nil)
	info := mustCreate(t, m, "A")
	p, _ := m.OpenProject(info.ID)
	if err := p.SaveEnvironments([]Environment{{Name: "e", BaseURL: "http://x"}}); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}

	err := filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() && strings.HasSuffix(d.Name(), ".tmp") {
			t.Errorf("leftover temp file %s", path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk: %v", err)
	}
}
