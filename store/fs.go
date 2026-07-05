package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
)

// tmpFilePattern names the scratch files writeJSONAtomic creates. It must not
// match "*.json" so directory scans never pick up a half-written file.
const tmpFilePattern = ".cascade-*.tmp"

// File-backed ids double as file names; anything looser could escape the
// project directory.
var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

var errBadFileID = errors.New("id must be non-empty and contain only letters, digits, '-' or '_'")

func validFileID(id string) bool { return idPattern.MatchString(id) }

// readJSON unmarshals the JSON file at path into v. A missing file surfaces
// as os.ErrNotExist so callers can treat it as "empty".
func readJSON(path string, v any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, v); err != nil {
		return fmt.Errorf("%s: %w", filepath.Base(path), err)
	}
	return nil
}

// readListFile reads a JSON array file, mapping a missing file (and a JSON
// null) to an empty, non-nil slice — non-nil so Wails serializes [] not null.
func readListFile[T any](path string) ([]T, error) {
	var list []T
	err := readJSON(path, &list)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if list == nil {
		list = []T{}
	}
	return list, nil
}

// writeJSONAtomic writes v as indented JSON (project files are meant to live
// in git; indentation keeps them diff-friendly) via a temp file in the target
// directory followed by a rename, so readers never observe a torn file and a
// crash mid-write leaves the previous content intact.
func writeJSONAtomic(path string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')

	tmp, err := os.CreateTemp(filepath.Dir(path), tmpFilePattern)
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	_, err = tmp.Write(data)
	if cerr := tmp.Close(); err == nil {
		err = cerr
	}
	if err == nil {
		err = os.Rename(tmpName, path)
	}
	if err != nil {
		os.Remove(tmpName)
		return fmt.Errorf("write %s: %w", filepath.Base(path), err)
	}
	return nil
}
