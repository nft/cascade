package store

import (
	"crypto/rand"
	"fmt"
)

// idAlphabet is lowercase base32; its 32 characters divide 256 evenly, so
// mapping random bytes with a modulo introduces no bias.
const (
	idAlphabet = "abcdefghijklmnopqrstuvwxyz234567"
	idLength   = 10
)

// NewID returns a random short identifier. IDs are never derived from
// user-visible names: renames must not move files or break references.
func NewID() (string, error) {
	buf := make([]byte, idLength)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate id: %w", err)
	}
	for i, b := range buf {
		buf[i] = idAlphabet[int(b)%len(idAlphabet)]
	}
	return string(buf), nil
}
