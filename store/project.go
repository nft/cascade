package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// Project is a live handle on one project directory. A coarse per-project
// mutex serializes all file access; handles are shared via the Manager so two
// callers never race on the same project.
type Project struct {
	id  string
	dir string
	mu  sync.Mutex
}

// ID returns the project's identifier.
func (p *Project) ID() string { return p.id }

// Dir returns the project's directory on disk.
func (p *Project) Dir() string { return p.dir }

// Meta reads project.json.
func (p *Project) Meta() (ProjectMeta, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.readMeta()
}

// SetDefaults stores the project-wide default environment and credential
// applied to newly added nodes.
func (p *Project) SetDefaults(d Defaults) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	meta, err := p.readMeta()
	if err != nil {
		return err
	}
	meta.Defaults = d
	return p.writeMeta(meta)
}

// setName is the project.json half of Manager.RenameProject.
func (p *Project) setName(name string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	meta, err := p.readMeta()
	if err != nil {
		return err
	}
	meta.Name = name
	return p.writeMeta(meta)
}

func (p *Project) readMeta() (ProjectMeta, error) {
	var meta ProjectMeta
	if err := readJSON(filepath.Join(p.dir, projectFileName), &meta); err != nil {
		return ProjectMeta{}, fmt.Errorf("read %s: %w", projectFileName, err)
	}
	if meta.FormatVersion > ProjectFormatVersion {
		return ProjectMeta{}, fmt.Errorf("project format version %d is newer than supported version %d",
			meta.FormatVersion, ProjectFormatVersion)
	}
	return meta, nil
}

func (p *Project) writeMeta(meta ProjectMeta) error {
	return writeJSONAtomic(filepath.Join(p.dir, projectFileName), meta)
}

// Environments returns the project's environments (empty when none exist).
func (p *Project) Environments() ([]Environment, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return readListFile[Environment](filepath.Join(p.dir, environmentsFile))
}

// SaveEnvironments replaces the project's environment list.
func (p *Project) SaveEnvironments(envs []Environment) error {
	if envs == nil {
		envs = []Environment{}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return writeJSONAtomic(filepath.Join(p.dir, environmentsFile), envs)
}

// Credentials returns the project's credential metadata (never values).
func (p *Project) Credentials() ([]Credential, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return readListFile[Credential](filepath.Join(p.dir, credentialsFile))
}

// SaveCredentials replaces the project's credential metadata list. Metadata
// the injection engine could not execute is rejected here, so it never
// reaches disk.
func (p *Project) SaveCredentials(creds []Credential) error {
	if creds == nil {
		creds = []Credential{}
	}
	seen := map[string]bool{}
	for _, c := range creds {
		if err := validateCredential(c); err != nil {
			return err
		}
		if seen[c.Name] {
			return fmt.Errorf("credential %q appears twice", c.Name)
		}
		seen[c.Name] = true
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return writeJSONAtomic(filepath.Join(p.dir, credentialsFile), creds)
}

// Sources returns the project's imported schema sources, ordered by file name.
func (p *Project) Sources() ([]Source, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	sources := []Source{}
	err := p.eachJSONFile(sourcesDirName, func(path string) error {
		var s Source
		if err := readJSON(path, &s); err != nil {
			return err
		}
		if s.Operations == nil {
			s.Operations = []Operation{}
		}
		sources = append(sources, s)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return sources, nil
}

// SaveSource writes one source document; the id is the file name.
func (p *Project) SaveSource(s Source) error {
	if !validFileID(s.ID) {
		return fmt.Errorf("source id %q: %w", s.ID, errBadFileID)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return writeJSONAtomic(filepath.Join(p.dir, sourcesDirName, s.ID+jsonExt), s)
}

// Boards returns all of the project's boards, ordered by file name.
func (p *Project) Boards() ([]Board, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	boards := []Board{}
	err := p.eachJSONFile(boardsDirName, func(path string) error {
		b, err := readBoard(path)
		if err != nil {
			return err
		}
		boards = append(boards, b)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return boards, nil
}

// Board loads a single board by id.
func (p *Project) Board(id string) (Board, error) {
	if !validFileID(id) {
		return Board{}, fmt.Errorf("board id %q: %w", id, errBadFileID)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	b, err := readBoard(filepath.Join(p.dir, boardsDirName, id+jsonExt))
	if errors.Is(err, os.ErrNotExist) {
		return Board{}, fmt.Errorf("board %q: %w", id, ErrNotFound)
	}
	return b, err
}

// SaveBoard validates the board (well-formed DAG, per-type edge rules, safe
// id) and writes it atomically.
func (p *Project) SaveBoard(b Board) error {
	b.normalize()
	if err := b.validate(); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return writeJSONAtomic(filepath.Join(p.dir, boardsDirName, b.ID+jsonExt), b)
}

// Collections returns all of the project's request collections, ordered by
// file name.
func (p *Project) Collections() ([]Collection, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	collections := []Collection{}
	err := p.eachJSONFile(collectionsDir, func(path string) error {
		var c Collection
		if err := readJSON(path, &c); err != nil {
			return err
		}
		if c.FormatVersion > CollectionFormatVersion {
			return fmt.Errorf("collection %q: format version %d is newer than supported version %d",
				c.ID, c.FormatVersion, CollectionFormatVersion)
		}
		c.normalize()
		collections = append(collections, c)
		return nil
	})
	if err != nil {
		return nil, err
	}
	return collections, nil
}

// SaveCollection validates the collection (safe id, depth cap, known
// protocols) and writes it atomically; the id is the file name.
func (p *Project) SaveCollection(c Collection) error {
	c.normalize()
	if err := c.validate(); err != nil {
		return err
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	// Projects created before collections existed lack the subdirectory.
	if err := os.MkdirAll(filepath.Join(p.dir, collectionsDir), dirPerm); err != nil {
		return err
	}
	return writeJSONAtomic(filepath.Join(p.dir, collectionsDir, c.ID+jsonExt), c)
}

// DeleteCollection removes one collection file.
func (p *Project) DeleteCollection(id string) error {
	if !validFileID(id) {
		return fmt.Errorf("collection id %q: %w", id, errBadFileID)
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	err := os.Remove(filepath.Join(p.dir, collectionsDir, id+jsonExt))
	if errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("collection %q: %w", id, ErrNotFound)
	}
	return err
}

// eachJSONFile calls fn for every *.json file in the project subdirectory,
// in lexical order. A missing directory is treated as empty.
func (p *Project) eachJSONFile(subdir string, fn func(path string) error) error {
	dir := filepath.Join(p.dir, subdir)
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), jsonExt) {
			continue
		}
		if err := fn(filepath.Join(dir, e.Name())); err != nil {
			return err
		}
	}
	return nil
}

func readBoard(path string) (Board, error) {
	var b Board
	if err := readJSON(path, &b); err != nil {
		return Board{}, err
	}
	if b.FormatVersion > BoardFormatVersion {
		return Board{}, fmt.Errorf("board %q: format version %d is newer than supported version %d",
			b.ID, b.FormatVersion, BoardFormatVersion)
	}
	b.normalize()
	return b, nil
}
