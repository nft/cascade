// Package store persists Cascade projects as plain, diff-friendly JSON under
// a single root directory (one directory per project plus a projects.json
// index). It is app-layer code: the core engine stays persistence-free, and
// nothing here depends on Wails, so the same store can back the desktop app,
// a headless CLI runner, or a server build.
package store

import (
	"errors"
	"fmt"
	"os"
	"path"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// File and directory names inside the store root and a project directory.
const (
	indexFile        = "projects.json"
	projectsDirName  = "projects"
	projectFileName  = "project.json"
	environmentsFile = "environments.json"
	credentialsFile  = "credentials.json"
	sourcesDirName   = "sources"
	boardsDirName    = "boards"
	collectionsDir   = "collections"
	logsDirName      = "logs"
	jsonExt          = ".json"
)

// ProjectFormatVersion is the on-disk format version of project.json.
const ProjectFormatVersion = 1

// DefaultBoardName names the board auto-created with every project, so a
// fresh project opens straight onto an empty canvas.
const DefaultBoardName = "Main"

const dirPerm = 0o755

// ErrNotFound is returned when an id does not resolve to a known project.
var ErrNotFound = errors.New("not found")

// Manager owns the store root: the projects.json index and one directory per
// project. All methods are safe for concurrent use.
type Manager struct {
	root    string
	secrets SecretStore

	mu sync.Mutex
	// open shares one handle per project so the per-project mutex actually
	// serializes concurrent callers.
	open map[string]*Project
}

// NewManager returns a Manager rooted at dir (created lazily on first write).
// secrets may be nil until the keychain-backed SecretStore lands.
func NewManager(dir string, secrets SecretStore) *Manager {
	if secrets == nil {
		secrets = NoopSecretStore{}
	}
	return &Manager{root: dir, secrets: secrets, open: make(map[string]*Project)}
}

// Secrets exposes the secret store for credential value reads and writes.
func (m *Manager) Secrets() SecretStore { return m.secrets }

// ListProjects returns the index entries in index order.
func (m *Manager) ListProjects() ([]ProjectInfo, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.readIndex()
}

// CreateProject provisions a new project directory (with empty environment
// and credential lists and an empty "Main" board) and registers it in the
// index.
func (m *Manager) CreateProject(name string) (info ProjectInfo, err error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return ProjectInfo{}, errors.New("project name must not be empty")
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.readIndex()
	if err != nil {
		return ProjectInfo{}, err
	}

	id, err := NewID()
	if err != nil {
		return ProjectInfo{}, err
	}
	rel := path.Join(projectsDirName, id)
	dir := m.resolveDir(rel)
	defer func() {
		// A half-created project must not linger as an orphan directory.
		if err != nil {
			os.RemoveAll(dir)
		}
	}()

	for _, sub := range []string{sourcesDirName, boardsDirName, collectionsDir, logsDirName} {
		if err := os.MkdirAll(filepath.Join(dir, sub), dirPerm); err != nil {
			return ProjectInfo{}, err
		}
	}
	meta := ProjectMeta{FormatVersion: ProjectFormatVersion, ID: id, Name: name, CreatedAt: nowRFC3339()}
	if err := writeJSONAtomic(filepath.Join(dir, projectFileName), meta); err != nil {
		return ProjectInfo{}, err
	}
	if err := writeJSONAtomic(filepath.Join(dir, environmentsFile), []Environment{}); err != nil {
		return ProjectInfo{}, err
	}
	if err := writeJSONAtomic(filepath.Join(dir, credentialsFile), []Credential{}); err != nil {
		return ProjectInfo{}, err
	}

	boardID, err := NewID()
	if err != nil {
		return ProjectInfo{}, err
	}
	board := Board{ID: boardID, Name: DefaultBoardName}
	board.normalize()
	if err := writeJSONAtomic(filepath.Join(dir, boardsDirName, boardID+jsonExt), board); err != nil {
		return ProjectInfo{}, err
	}

	info = ProjectInfo{ID: id, Name: name, Path: rel}
	if err := m.writeIndex(append(index, info)); err != nil {
		return ProjectInfo{}, err
	}
	return info, nil
}

// Project returns a live handle without touching lastOpenedAt (for saves and
// other background access).
func (m *Manager) Project(id string) (*Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.readIndex()
	if err != nil {
		return nil, err
	}
	i := indexOf(index, id)
	if i < 0 {
		return nil, fmt.Errorf("project %q: %w", id, ErrNotFound)
	}
	return m.handleLocked(index[i]), nil
}

// OpenProject returns a live handle and stamps lastOpenedAt, so the app can
// reopen the most recently used project on launch.
func (m *Manager) OpenProject(id string) (*Project, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.readIndex()
	if err != nil {
		return nil, err
	}
	i := indexOf(index, id)
	if i < 0 {
		return nil, fmt.Errorf("project %q: %w", id, ErrNotFound)
	}
	index[i].LastOpenedAt = nowRFC3339()
	if err := m.writeIndex(index); err != nil {
		return nil, err
	}
	return m.handleLocked(index[i]), nil
}

// RenameProject renames the project in both the index and its project.json.
// The directory never moves: ids, not names, address projects on disk.
func (m *Manager) RenameProject(id, name string) (ProjectInfo, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return ProjectInfo{}, errors.New("project name must not be empty")
	}

	m.mu.Lock()
	index, err := m.readIndex()
	if err != nil {
		m.mu.Unlock()
		return ProjectInfo{}, err
	}
	i := indexOf(index, id)
	if i < 0 {
		m.mu.Unlock()
		return ProjectInfo{}, fmt.Errorf("project %q: %w", id, ErrNotFound)
	}
	index[i].Name = name
	info := index[i]
	p := m.handleLocked(info)
	if err := m.writeIndex(index); err != nil {
		m.mu.Unlock()
		return ProjectInfo{}, err
	}
	m.mu.Unlock()

	if err := p.setName(name); err != nil {
		return ProjectInfo{}, err
	}
	return info, nil
}

// DeleteProject removes the project's index entry, directory, and
// (best-effort) keychain entries. When only the keychain cleanup fails the
// returned error is a *SecretCleanupError and the project is already gone.
func (m *Manager) DeleteProject(id string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	index, err := m.readIndex()
	if err != nil {
		return err
	}
	i := indexOf(index, id)
	if i < 0 {
		return fmt.Errorf("project %q: %w", id, ErrNotFound)
	}
	dir := m.resolveDir(index[i].Path)
	// The keychain cannot enumerate entries, so read the credential names
	// while credentials.json still exists; a missing/corrupt file just means
	// no secrets to clean up.
	credNames := []string{}
	if creds, err := readListFile[Credential](filepath.Join(dir, credentialsFile)); err == nil {
		for _, c := range creds {
			credNames = append(credNames, c.Name)
		}
	}
	if err := m.writeIndex(slices.Delete(index, i, i+1)); err != nil {
		return err
	}
	delete(m.open, id)
	if err := os.RemoveAll(dir); err != nil {
		return fmt.Errorf("delete project files: %w", err)
	}
	if leftover, err := m.secrets.DeleteProjectSecrets(id, credNames); err != nil || len(leftover) > 0 {
		return &SecretCleanupError{ProjectID: id, Leftover: leftover, Err: err}
	}
	return nil
}

func (m *Manager) readIndex() ([]ProjectInfo, error) {
	index, err := readListFile[ProjectInfo](filepath.Join(m.root, indexFile))
	if err != nil {
		return nil, fmt.Errorf("read project index: %w", err)
	}
	return index, nil
}

func (m *Manager) writeIndex(index []ProjectInfo) error {
	if err := os.MkdirAll(m.root, dirPerm); err != nil {
		return err
	}
	if err := writeJSONAtomic(filepath.Join(m.root, indexFile), index); err != nil {
		return fmt.Errorf("write project index: %w", err)
	}
	return nil
}

// handleLocked returns the shared handle for the project, creating it on
// first use. Callers must hold m.mu.
func (m *Manager) handleLocked(info ProjectInfo) *Project {
	if p, ok := m.open[info.ID]; ok {
		return p
	}
	p := &Project{id: info.ID, dir: m.resolveDir(info.Path)}
	m.open[info.ID] = p
	return p
}

func (m *Manager) resolveDir(p string) string {
	fp := filepath.FromSlash(p)
	if filepath.IsAbs(fp) {
		return fp
	}
	return filepath.Join(m.root, fp)
}

func indexOf(index []ProjectInfo, id string) int {
	return slices.IndexFunc(index, func(p ProjectInfo) bool { return p.ID == id })
}

// nowRFC3339 uses nanosecond resolution: lastOpenedAt drives "reopen the
// last-open project", and two switches inside the same second must not tie.
func nowRFC3339() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
