// Package share implements board export/import and clipboard sharing
// (plan 07): one self-identifying JSON envelope for whole-board files and
// copied selections alike. It is app-layer — it knows project business
// (requires mapping) — but stays free of Wails and any UI dependency.
//
// Secrets are structurally impossible to leak here: the package reads board
// and project metadata only and has no code path into the secret store;
// requires.credentials carries name + kind, nothing else.
package share

import (
	"encoding/json"
	"errors"
	"fmt"

	"cascade/store"
)

// EnvelopeFormatVersion is the version of the envelope itself, gated on
// parse. The embedded board additionally carries its own graph formatVersion.
const EnvelopeFormatVersion = 1

// producerApp identifies the writing application in exports — informational
// only, never used for gating (that is what formatVersion is for).
const producerApp = "cascade/0.1"

// Envelope kinds: a whole board (file export/import) or a copied selection
// (clipboard). Same format, same import pipeline.
const (
	KindBoard     = "board"
	KindSelection = "selection"
)

// envelopeRootKey makes payloads self-identifying, so paste can distinguish
// Cascade envelopes from arbitrary clipboard text.
const envelopeRootKey = "cascade"

// ErrNotEnvelope reports that pasted/opened data is not a Cascade envelope at
// all (arbitrary text, foreign JSON). Callers ignore the paste rather than
// surface an error; anything that IS an envelope but malformed errors loudly.
var ErrNotEnvelope = errors.New("not a cascade envelope")

// Envelope is the on-wire root: {"cascade": {...}}.
type Envelope struct {
	Cascade Payload `json:"cascade"`
}

// Payload carries one shareable graph plus everything the importing side
// needs to re-home it: named requirements to map onto the target project and
// the collection request definitions its nodes reference (plan 08).
type Payload struct {
	Kind          string `json:"kind"` // KindBoard | KindSelection
	FormatVersion int    `json:"formatVersion"`
	// App is the producer, informational only.
	App      string      `json:"app"`
	Board    store.Board `json:"board"`
	Requires Requires    `json:"requires"`
	// Collections embeds the request definitions referenced by the board's
	// requestRef provenance links, trimmed to the referenced requests only.
	Collections []store.Collection `json:"collections,omitempty"`
}

// Requires lists what the board expects to exist in the target project —
// names/metadata only, resolved by the import mapping step. Unmapped entries
// degrade to warnings on the imported nodes, never a failed import.
type Requires struct {
	Environments []string                `json:"environments"`
	Credentials  []CredentialRequirement `json:"credentials"`
	// Sources is reserved: nodes carry no source references yet (operations
	// are copied onto nodes at insertion), so exporters emit an empty list.
	// Present in the format so source-linked nodes need no version break.
	Sources []SourceRequirement `json:"sources"`
}

// CredentialRequirement names a credential a node references. Kind is a
// mapping hint for the import wizard — never the secret, never the value.
type CredentialRequirement struct {
	Name string `json:"name"`
	Kind string `json:"kind,omitempty"`
}

// SourceRequirement is a referenced schema source, embedded or by reference.
type SourceRequirement struct {
	ID       string        `json:"id"`
	Title    string        `json:"title"`
	Embedded bool          `json:"embedded"`
	Source   *store.Source `json:"source,omitempty"`
}

// marshal renders an envelope in its stable wire form: two-space indent,
// LF line endings, struct fields in declared order, map keys sorted (both
// encoding/json guarantees) — exports diff cleanly in git.
func marshal(e Envelope) ([]byte, error) {
	raw, err := json.MarshalIndent(e, "", "  ")
	if err != nil {
		return nil, err
	}
	return append(raw, '\n'), nil
}

// Parse reads data as a Cascade envelope. Non-envelope input (arbitrary
// clipboard text, foreign JSON) returns ErrNotEnvelope; an envelope written
// by a newer app version or with a malformed payload is an explicit error.
func Parse(data []byte) (Envelope, error) {
	var probe map[string]json.RawMessage
	if err := json.Unmarshal(data, &probe); err != nil {
		return Envelope{}, ErrNotEnvelope
	}
	raw, ok := probe[envelopeRootKey]
	if !ok {
		return Envelope{}, ErrNotEnvelope
	}
	var p Payload
	if err := json.Unmarshal(raw, &p); err != nil {
		return Envelope{}, fmt.Errorf("malformed cascade envelope: %w", err)
	}
	if p.FormatVersion > EnvelopeFormatVersion {
		return Envelope{}, fmt.Errorf(
			"this was made with a newer Cascade (format version %d, this app supports up to %d) — update to import it",
			p.FormatVersion, EnvelopeFormatVersion)
	}
	if p.Kind != KindBoard && p.Kind != KindSelection {
		return Envelope{}, fmt.Errorf("cascade envelope has unknown kind %q", p.Kind)
	}
	return Envelope{Cascade: p}, nil
}
