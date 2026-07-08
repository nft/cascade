package store

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

const (
	secretsKeyFile  = "secrets.key"
	secretsDataFile = "secrets.enc"
	// secretFilePerm keeps both files owner-only; the key must never be
	// group- or world-readable.
	secretFilePerm = 0o600
	secretKeyBytes = 32 // AES-256
)

// FileSecretStore is the fallback when no OS keychain is usable: an
// AES-256-GCM-encrypted JSON map on disk, keyed by a random key stored next
// to it with owner-only permissions. This protects secrets from casual reads
// and accidental check-ins/backups — not from an attacker who already runs as
// the same user, which is also true of most OS keychains once unlocked.
type FileSecretStore struct {
	dir string
	key []byte
	mu  sync.Mutex
}

// NewFileSecretStore opens (or initializes) the encrypted store in dir.
func NewFileSecretStore(dir string) (*FileSecretStore, error) {
	if err := os.MkdirAll(dir, dirPerm); err != nil {
		return nil, err
	}
	keyPath := filepath.Join(dir, secretsKeyFile)
	key, err := os.ReadFile(keyPath)
	if os.IsNotExist(err) {
		key = make([]byte, secretKeyBytes)
		if _, err := rand.Read(key); err != nil {
			return nil, fmt.Errorf("generate secrets key: %w", err)
		}
		if err := os.WriteFile(keyPath, key, secretFilePerm); err != nil {
			return nil, fmt.Errorf("write secrets key: %w", err)
		}
	} else if err != nil {
		return nil, fmt.Errorf("read secrets key: %w", err)
	}
	if len(key) != secretKeyBytes {
		return nil, fmt.Errorf("secrets key file %s is corrupt (%d bytes, want %d)", keyPath, len(key), secretKeyBytes)
	}
	return &FileSecretStore{dir: dir, key: key}, nil
}

func (s *FileSecretStore) SetSecret(projectID, credentialName, value string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	secrets, err := s.load()
	if err != nil {
		return err
	}
	secrets[secretAccount(projectID, credentialName)] = value
	return s.save(secrets)
}

func (s *FileSecretStore) GetSecret(projectID, credentialName string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	secrets, err := s.load()
	if err != nil {
		return "", err
	}
	value, ok := secrets[secretAccount(projectID, credentialName)]
	if !ok {
		return "", ErrSecretNotFound
	}
	return value, nil
}

func (s *FileSecretStore) DeleteSecret(projectID, credentialName string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	secrets, err := s.load()
	if err != nil {
		return err
	}
	account := secretAccount(projectID, credentialName)
	if _, ok := secrets[account]; !ok {
		return nil
	}
	delete(secrets, account)
	return s.save(secrets)
}

func (s *FileSecretStore) DeleteProjectSecrets(projectID string, names []string) ([]string, error) {
	return deleteEach(s, projectID, names)
}

// load decrypts the data file into the account→value map; a missing file is
// an empty store.
func (s *FileSecretStore) load() (map[string]string, error) {
	sealed, err := os.ReadFile(filepath.Join(s.dir, secretsDataFile))
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read secrets file: %w", err)
	}
	gcm, err := s.cipher()
	if err != nil {
		return nil, err
	}
	if len(sealed) < gcm.NonceSize() {
		return nil, fmt.Errorf("secrets file is corrupt")
	}
	plain, err := gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt secrets file: %w", err)
	}
	secrets := map[string]string{}
	if err := json.Unmarshal(plain, &secrets); err != nil {
		return nil, fmt.Errorf("parse secrets file: %w", err)
	}
	return secrets, nil
}

// save encrypts the map as nonce||ciphertext and writes it atomically-enough
// for a single-user desktop app (0600, full rewrite under the store mutex).
func (s *FileSecretStore) save(secrets map[string]string) error {
	plain, err := json.Marshal(secrets)
	if err != nil {
		return err
	}
	gcm, err := s.cipher()
	if err != nil {
		return err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return fmt.Errorf("generate nonce: %w", err)
	}
	sealed := append(nonce, gcm.Seal(nil, nonce, plain, nil)...)
	return os.WriteFile(filepath.Join(s.dir, secretsDataFile), sealed, secretFilePerm)
}

func (s *FileSecretStore) cipher() (cipher.AEAD, error) {
	block, err := aes.NewCipher(s.key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
