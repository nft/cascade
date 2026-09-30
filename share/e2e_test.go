package share

import (
	"bytes"
	"strings"
	"testing"

	"cascade/store"
)

// TestCrossProjectRoundTrip is the sharing scenario at the format level:
// machine A exports a board; machine B — a different store root, empty
// project, no shared keychain — imports it, creates the placeholders the
// mapping wizard offers for the requires it can satisfy, and re-exports.
// The re-export must be byte-identical to A's file except for the board ID.
func TestCrossProjectRoundTrip(t *testing.T) {
	// Machine A: the full fixture project with the three-node chain.
	a := newTestProject(t)
	if err := a.SaveBoard(testBoard()); err != nil {
		t.Fatalf("A SaveBoard: %v", err)
	}
	fromA, err := ExportBoard(a, "b1")
	if err != nil {
		t.Fatalf("A ExportBoard: %v", err)
	}

	// Machine B: a completely separate, empty project.
	managerB := store.NewManager(t.TempDir(), nil)
	infoB, err := managerB.CreateProject("Receiver")
	if err != nil {
		t.Fatalf("B CreateProject: %v", err)
	}
	b, err := managerB.Project(infoB.ID)
	if err != nil {
		t.Fatalf("B Project: %v", err)
	}

	imported, payload, err := ImportBoard(b, fromA)
	if err != nil {
		t.Fatalf("B ImportBoard: %v", err)
	}

	// The wizard's "create placeholder" outcome: environments with the
	// required names, and the hinted credential as metadata without a value.
	// The hint-less ghost-cred row is left unmapped — it was dangling on A
	// too, so creating it would add information A's export never carried.
	envs := make([]store.Environment, len(payload.Requires.Environments))
	for i, name := range payload.Requires.Environments {
		envs[i] = store.Environment{Name: name}
	}
	if err := b.SaveEnvironments(envs); err != nil {
		t.Fatalf("B SaveEnvironments: %v", err)
	}
	creds := []store.Credential{}
	for _, c := range payload.Requires.Credentials {
		if c.Kind != "" {
			creds = append(creds, store.Credential{Name: c.Name, Kind: c.Kind})
		}
	}
	if err := b.SaveCredentials(creds); err != nil {
		t.Fatalf("B SaveCredentials: %v", err)
	}
	// The embedded-collections merge: B's project is empty, so the
	// trimmed collections import as-is.
	for _, col := range payload.Collections {
		if err := b.SaveCollection(col); err != nil {
			t.Fatalf("B SaveCollection: %v", err)
		}
	}

	fromB, err := ExportBoard(b, imported.ID)
	if err != nil {
		t.Fatalf("B re-export: %v", err)
	}
	// B's board kept A's name (the project was empty, no dedup) and A's node
	// IDs; only the board ID is fresh.
	normalized := strings.ReplaceAll(string(fromB), imported.ID, "b1")
	if !bytes.Equal([]byte(normalized), fromA) {
		t.Errorf("re-export from B differs from A's file beyond the board ID:\n--- A ---\n%s\n--- B ---\n%s",
			fromA, normalized)
	}
}
