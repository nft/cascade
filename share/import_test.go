package share

import (
	"reflect"
	"strings"
	"testing"
)

func TestImportBoard(t *testing.T) {
	p := newTestProject(t)
	if err := p.SaveBoard(testBoard()); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}
	exported, err := ExportBoard(p, "b1")
	if err != nil {
		t.Fatalf("ExportBoard: %v", err)
	}

	before, err := p.Boards()
	if err != nil {
		t.Fatalf("Boards: %v", err)
	}

	imported, payload, err := ImportBoard(p, exported)
	if err != nil {
		t.Fatalf("ImportBoard: %v", err)
	}
	if imported.ID == "" || imported.ID == "b1" {
		t.Errorf("imported board ID = %q, want a fresh one", imported.ID)
	}
	if imported.Name != "Signup chain 2" {
		t.Errorf("imported board name = %q, want deduplicated %q", imported.Name, "Signup chain 2")
	}
	// The payload travels back so the caller can run the mapping step.
	if !reflect.DeepEqual(payload.Requires.Environments, []string{"local", "staging"}) {
		t.Errorf("payload environments = %v, want [local staging]", payload.Requires.Environments)
	}

	// The import must be persisted as a new board, never merged.
	after, err := p.Boards()
	if err != nil {
		t.Fatalf("Boards: %v", err)
	}
	if len(after) != len(before)+1 {
		t.Fatalf("project has %d boards after import, want %d", len(after), len(before)+1)
	}

	// Re-exporting the import diffs against the original only in board
	// identity: graph, layout and requires are byte-identical.
	reexported, err := ExportBoard(p, imported.ID)
	if err != nil {
		t.Fatalf("re-export: %v", err)
	}
	original, err := Parse(exported)
	if err != nil {
		t.Fatalf("Parse original: %v", err)
	}
	roundTripped, err := Parse(reexported)
	if err != nil {
		t.Fatalf("Parse re-export: %v", err)
	}
	got, want := roundTripped.Cascade, original.Cascade
	got.Board.ID, got.Board.Name = want.Board.ID, want.Board.Name
	if !reflect.DeepEqual(got, want) {
		t.Errorf("re-export differs beyond board identity:\ngot  %+v\nwant %+v", got, want)
	}
}

func TestImportBoardNameFallsBackForSelections(t *testing.T) {
	p := newTestProject(t)
	if err := p.SaveBoard(testBoard()); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}
	exported, err := ExportSelection(p, testBoard(), []string{"n2", "n3"})
	if err != nil {
		t.Fatalf("ExportSelection: %v", err)
	}
	imported, _, err := ImportBoard(p, exported)
	if err != nil {
		t.Fatalf("ImportBoard: %v", err)
	}
	if imported.Name != fallbackBoardName {
		t.Errorf("imported selection name = %q, want %q", imported.Name, fallbackBoardName)
	}
	if len(imported.Nodes) != 2 {
		t.Errorf("imported selection has %d nodes, want 2", len(imported.Nodes))
	}
}

func TestImportBoardRejectsBadInput(t *testing.T) {
	p := newTestProject(t)
	if _, _, err := ImportBoard(p, []byte("just some clipboard text")); err == nil {
		t.Error("importing non-envelope text should error")
	}
	newer := []byte(`{"cascade": {"kind": "board", "formatVersion": 99, "app": "cascade/9", "board": {}, "requires": {"environments": [], "credentials": [], "sources": []}}}`)
	if _, _, err := ImportBoard(p, newer); err == nil || !strings.Contains(err.Error(), "newer") {
		t.Errorf("importing a newer format should surface the version error, got %v", err)
	}
}
