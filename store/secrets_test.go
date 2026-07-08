package store

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/zalando/go-keyring"
)

func TestFileSecretStoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFileSecretStore(dir)
	if err != nil {
		t.Fatalf("NewFileSecretStore: %v", err)
	}

	if _, err := s.GetSecret("p1", "a"); !errors.Is(err, ErrSecretNotFound) {
		t.Errorf("missing secret: err = %v, want ErrSecretNotFound", err)
	}
	if err := s.SetSecret("p1", "a", "first"); err != nil {
		t.Fatalf("SetSecret: %v", err)
	}
	if err := s.SetSecret("p1", "a", "rotated"); err != nil {
		t.Fatalf("SetSecret (rotate): %v", err)
	}
	if got, err := s.GetSecret("p1", "a"); err != nil || got != "rotated" {
		t.Errorf("GetSecret = %q, %v; want rotated", got, err)
	}

	// Same name under another project is a different secret.
	if err := s.SetSecret("p2", "a", "other"); err != nil {
		t.Fatalf("SetSecret p2: %v", err)
	}
	if got, _ := s.GetSecret("p1", "a"); got != "rotated" {
		t.Errorf("p1 secret clobbered by p2 write: %q", got)
	}

	if err := s.DeleteSecret("p1", "a"); err != nil {
		t.Fatalf("DeleteSecret: %v", err)
	}
	if err := s.DeleteSecret("p1", "a"); err != nil {
		t.Errorf("deleting a missing secret must be a no-op, got %v", err)
	}
	if _, err := s.GetSecret("p1", "a"); !errors.Is(err, ErrSecretNotFound) {
		t.Errorf("deleted secret still resolves: %v", err)
	}
	if got, err := s.GetSecret("p2", "a"); err != nil || got != "other" {
		t.Errorf("p2 secret lost: %q, %v", got, err)
	}
}

func TestFileSecretStoreEncryptsAtRest(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFileSecretStore(dir)
	if err != nil {
		t.Fatalf("NewFileSecretStore: %v", err)
	}
	const secret = "hunter2-plaintext-marker"
	if err := s.SetSecret("p1", "a", secret); err != nil {
		t.Fatalf("SetSecret: %v", err)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}
	for _, e := range entries {
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			t.Fatalf("read %s: %v", e.Name(), err)
		}
		if strings.Contains(string(raw), secret) {
			t.Errorf("file %s contains the plaintext secret", e.Name())
		}
		if runtime.GOOS != "windows" {
			info, _ := e.Info()
			if perm := info.Mode().Perm(); perm != secretFilePerm {
				t.Errorf("file %s has permissions %o, want %o", e.Name(), perm, secretFilePerm)
			}
		}
	}

	// A fresh store over the same dir reads the same values (key reload).
	s2, err := NewFileSecretStore(dir)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	if got, err := s2.GetSecret("p1", "a"); err != nil || got != secret {
		t.Errorf("reopened store: GetSecret = %q, %v", got, err)
	}
}

func TestFileSecretStoreDeleteProjectSecrets(t *testing.T) {
	s, err := NewFileSecretStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewFileSecretStore: %v", err)
	}
	_ = s.SetSecret("p1", "a", "1")
	_ = s.SetSecret("p1", "b", "2")
	_ = s.SetSecret("p2", "a", "3")

	leftover, err := s.DeleteProjectSecrets("p1", []string{"a", "b"})
	if err != nil || len(leftover) != 0 {
		t.Fatalf("DeleteProjectSecrets = %v, %v", leftover, err)
	}
	if _, err := s.GetSecret("p1", "a"); !errors.Is(err, ErrSecretNotFound) {
		t.Error("p1/a survived project cleanup")
	}
	if got, _ := s.GetSecret("p2", "a"); got != "3" {
		t.Errorf("other project's secret lost: %q", got)
	}
}

// TestKeychainSecretStore exercises the wrapper against go-keyring's
// in-memory mock — the real OS keychain never sees test data.
func TestKeychainSecretStore(t *testing.T) {
	keyring.MockInit()
	s := KeychainSecretStore{}

	if _, err := s.GetSecret("p1", "a"); !errors.Is(err, ErrSecretNotFound) {
		t.Errorf("missing secret: err = %v, want ErrSecretNotFound", err)
	}
	if err := s.SetSecret("p1", "a", "value"); err != nil {
		t.Fatalf("SetSecret: %v", err)
	}
	if got, err := s.GetSecret("p1", "a"); err != nil || got != "value" {
		t.Errorf("GetSecret = %q, %v", got, err)
	}
	if err := s.DeleteSecret("p1", "a"); err != nil {
		t.Fatalf("DeleteSecret: %v", err)
	}
	if err := s.DeleteSecret("p1", "a"); err != nil {
		t.Errorf("deleting a missing secret must be a no-op, got %v", err)
	}
	if _, err := s.GetSecret("p1", "a"); !errors.Is(err, ErrSecretNotFound) {
		t.Error("deleted secret still resolves")
	}
}
