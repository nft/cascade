package store

import (
	"errors"
	"fmt"

	"github.com/zalando/go-keyring"
)

// keychainService namespaces every Cascade entry in the OS keychain.
const keychainService = "cascade"

// KeychainSecretStore keeps secret values in the OS keychain (macOS Keychain,
// Windows Credential Manager, Secret Service on Linux) under service
// "cascade", account "<projectID>/<credentialName>".
type KeychainSecretStore struct{}

func (KeychainSecretStore) SetSecret(projectID, credentialName, value string) error {
	if err := keyring.Set(keychainService, secretAccount(projectID, credentialName), value); err != nil {
		return fmt.Errorf("store secret in keychain: %w", err)
	}
	return nil
}

func (KeychainSecretStore) GetSecret(projectID, credentialName string) (string, error) {
	value, err := keyring.Get(keychainService, secretAccount(projectID, credentialName))
	if errors.Is(err, keyring.ErrNotFound) {
		return "", ErrSecretNotFound
	}
	if err != nil {
		return "", fmt.Errorf("read secret from keychain: %w", err)
	}
	return value, nil
}

func (s KeychainSecretStore) DeleteSecret(projectID, credentialName string) error {
	err := keyring.Delete(keychainService, secretAccount(projectID, credentialName))
	if err != nil && !errors.Is(err, keyring.ErrNotFound) {
		return fmt.Errorf("delete secret from keychain: %w", err)
	}
	return nil
}

func (s KeychainSecretStore) DeleteProjectSecrets(projectID string, names []string) ([]string, error) {
	return deleteEach(s, projectID, names)
}

// keychainAvailable probes the OS keychain with a throwaway entry. Headless
// environments (no login keychain, no Secret Service bus) fail here, and the
// caller falls back to the encrypted-file store.
func keychainAvailable() bool {
	const probeAccount = "availability-probe"
	if err := keyring.Set(keychainService, probeAccount, "ok"); err != nil {
		return false
	}
	_ = keyring.Delete(keychainService, probeAccount)
	return true
}

// NewSecretStore returns the keychain store when the OS keychain is usable,
// otherwise an encrypted-file store rooted at dir.
func NewSecretStore(dir string) (SecretStore, error) {
	if keychainAvailable() {
		return KeychainSecretStore{}, nil
	}
	return NewFileSecretStore(dir)
}
