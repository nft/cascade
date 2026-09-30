package store

import (
	"errors"
	"fmt"
)

// SecretStore owns credential secret values, which never touch project
// files. Values are keyed by project ID and credential name; the
// engine-facing resolver reads them lazily at run time.
type SecretStore interface {
	// SetSecret stores (or replaces — rotation) one credential's value.
	SetSecret(projectID, credentialName, value string) error
	// GetSecret returns the stored value, or ErrSecretNotFound.
	GetSecret(projectID, credentialName string) (string, error)
	// DeleteSecret removes one value; a missing entry is not an error.
	DeleteSecret(projectID, credentialName string) error
	// DeleteProjectSecrets removes the named credentials' secrets, best-effort.
	// The caller supplies the names (read from credentials.json before the
	// project dir is removed) because the OS keychain cannot enumerate
	// entries. It returns the names it could not remove.
	DeleteProjectSecrets(projectID string, credentialNames []string) (leftover []string, err error)
}

// ErrSecretNotFound reports that a credential has no stored value (never
// entered, or the keychain entry was removed externally).
var ErrSecretNotFound = errors.New("secret value not found")

// secretAccount is the store-wide key for one secret: the keychain account
// name, and the map key in the file fallback.
func secretAccount(projectID, credentialName string) string {
	return projectID + "/" + credentialName
}

// deleteEach implements DeleteProjectSecrets on top of a per-entry delete.
func deleteEach(store SecretStore, projectID string, names []string) (leftover []string, err error) {
	var firstErr error
	for _, name := range names {
		if delErr := store.DeleteSecret(projectID, name); delErr != nil {
			leftover = append(leftover, name)
			if firstErr == nil {
				firstErr = delErr
			}
		}
	}
	return leftover, firstErr
}

// NoopSecretStore discards writes and never finds values. It backs a nil
// Manager store in tests; real deployments get KeychainSecretStore or
// FileSecretStore.
type NoopSecretStore struct{}

func (NoopSecretStore) SetSecret(string, string, string) error   { return nil }
func (NoopSecretStore) GetSecret(string, string) (string, error) { return "", ErrSecretNotFound }
func (NoopSecretStore) DeleteSecret(string, string) error        { return nil }
func (NoopSecretStore) DeleteProjectSecrets(string, []string) ([]string, error) {
	return nil, nil
}

// SecretCleanupError reports keychain entries left behind by DeleteProject.
// The project's files and index entry are already gone when it is returned,
// so callers should surface it as a warning, not roll back.
type SecretCleanupError struct {
	ProjectID string
	Leftover  []string
	Err       error
}

func (e *SecretCleanupError) Error() string {
	return fmt.Sprintf("project %s deleted, but keychain cleanup left entries %v: %v",
		e.ProjectID, e.Leftover, e.Err)
}

func (e *SecretCleanupError) Unwrap() error { return e.Err }
