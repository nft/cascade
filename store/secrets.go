package store

import "fmt"

// SecretStore owns credential secret values, which never touch project files.
// The real implementation lands with plan 04: values live in the OS keychain
// under service "cascade", account "<projectID>/<credentialName>", and that
// implementation is also where the engine-facing CredentialResolver (M1
// design decision 3) reads values lazily at run time.
type SecretStore interface {
	// DeleteProjectSecrets removes every secret belonging to the project,
	// best-effort. It returns the accounts it could not remove.
	DeleteProjectSecrets(projectID string) (leftover []string, err error)
}

// NoopSecretStore stands in until plan 04: no secrets are stored anywhere,
// so there is never anything to clean up.
type NoopSecretStore struct{}

func (NoopSecretStore) DeleteProjectSecrets(string) ([]string, error) { return nil, nil }

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
