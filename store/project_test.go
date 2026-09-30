package store

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"
)

func newTestProject(t *testing.T) (*Manager, *Project) {
	t.Helper()
	m := newTestManager(t)
	info := mustCreate(t, m, "Test")
	p, err := m.OpenProject(info.ID)
	if err != nil {
		t.Fatalf("OpenProject: %v", err)
	}
	return m, p
}

func TestEnvironmentAndCredentialRoundTrip(t *testing.T) {
	_, p := newTestProject(t)

	envs := []Environment{{Name: "local", BaseURL: "http://localhost:8080"}}
	if err := p.SaveEnvironments(envs); err != nil {
		t.Fatalf("SaveEnvironments: %v", err)
	}
	gotEnvs, err := p.Environments()
	if err != nil || !reflect.DeepEqual(gotEnvs, envs) {
		t.Fatalf("Environments = %+v, %v; want %+v", gotEnvs, err, envs)
	}

	creds := []Credential{{Name: "staging-admin", Kind: "bearer", CreatedAt: "2026-07-01"}}
	if err := p.SaveCredentials(creds); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}
	gotCreds, err := p.Credentials()
	if err != nil || !reflect.DeepEqual(gotCreds, creds) {
		t.Fatalf("Credentials = %+v, %v; want %+v", gotCreds, err, creds)
	}
}

func TestSaveCredentialsRejectsBadMetadata(t *testing.T) {
	_, p := newTestProject(t)
	bad := []struct {
		name  string
		creds []Credential
	}{
		{"empty name", []Credential{{Kind: "bearer"}}},
		{"legacy api-key kind", []Credential{{Name: "a", Kind: "api-key"}}},
		{"header kind without header", []Credential{{Name: "a", Kind: "header"}}},
		{"query kind without param", []Credential{{Name: "a", Kind: "query"}}},
		{"template without placeholder", []Credential{{Name: "a", Kind: "bearer", Template: "Token"}}},
		{"duplicate names", []Credential{{Name: "a", Kind: "bearer"}, {Name: "a", Kind: "basic"}}},
	}
	for _, tt := range bad {
		t.Run(tt.name, func(t *testing.T) {
			if err := p.SaveCredentials(tt.creds); err == nil {
				t.Error("invalid credential metadata saved")
			}
		})
	}

	// The flexible case must pass: any header name, any surrounding text.
	ok := []Credential{{Name: "internal", Kind: "header", Header: "X-Internal-Token", Template: "Token {secret}"}}
	if err := p.SaveCredentials(ok); err != nil {
		t.Errorf("valid header credential rejected: %v", err)
	}
}

func TestSourceRoundTrip(t *testing.T) {
	_, p := newTestProject(t)
	src := Source{
		ID:      "abc123",
		Title:   "demo-api",
		Version: "v1.4.0",
		Operations: []Operation{
			{Ref: "createUser", Method: "POST", Path: "/v1/users", Summary: "Create a user", Group: "Users"},
		},
	}
	if err := p.SaveSource(src); err != nil {
		t.Fatalf("SaveSource: %v", err)
	}
	got, err := p.Sources()
	if err != nil || len(got) != 1 || !reflect.DeepEqual(got[0], src) {
		t.Fatalf("Sources = %+v, %v; want [%+v]", got, err, src)
	}
}

func testBoard(id string) Board {
	return Board{
		ID:   id,
		Name: "Main",
		Nodes: []BoardNode{
			{ID: "create-user", Type: "http", Name: "Create User", Data: map[string]any{
				"method": "POST",
				"path":   "/v1/users",
				"repeat": float64(1),
			}},
			{ID: "create-org", Type: "http", Name: "Create Org"},
		},
		Edges: []BoardEdge{{ID: "e1", From: "create-user", To: "create-org"}},
		Layout: BoardLayout{
			Positions: map[string]Position{"create-user": {X: 0, Y: 140}, "create-org": {X: 300, Y: 140}},
			// Last responses ride along in the layout sidecar and
			// must survive the round trip untouched.
			Responses: map[string]CapturedResponse{
				"create-user": {
					Status: 201,
					Body:   map[string]any{"id": "u1"},
					At:     "2026-07-06T14:02:00Z",
				},
			},
		},
	}
}

func TestBoardSaveLoadRoundTrip(t *testing.T) {
	_, p := newTestProject(t)
	board := testBoard("board1")
	if err := p.SaveBoard(board); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}

	got, err := p.Board("board1")
	if err != nil {
		t.Fatalf("Board: %v", err)
	}
	board.FormatVersion = BoardFormatVersion // normalized on save
	if !reflect.DeepEqual(got, board) {
		t.Fatalf("round trip mismatch:\n got  %+v\n want %+v", got, board)
	}
}

// TestBoardSaveLoadKeepsContainment covers the real filesystem path for the
// two fields that are pure loss when dropped: a For's children and its size.
func TestBoardSaveLoadKeepsContainment(t *testing.T) {
	_, p := newTestProject(t)
	board := loopBoard("loops")
	if err := p.SaveBoard(board); err != nil {
		t.Fatalf("SaveBoard: %v", err)
	}

	got, err := p.Board("loops")
	if err != nil {
		t.Fatalf("Board: %v", err)
	}
	for _, id := range []string{"create-user", "create-org"} {
		if parent := boardNodeByID(t, got, id).Parent; parent != "each" {
			t.Errorf("node %q parent = %q after save/load, want %q", id, parent, "each")
		}
	}
	if size := got.Layout.Sizes["each"]; size != (Size{Width: 720, Height: 260}) {
		t.Errorf("container size = %+v after save/load", size)
	}
	if !reflect.DeepEqual(got, board) {
		t.Fatalf("round trip mismatch:\n got  %+v\n want %+v", got, board)
	}
}

func TestSaveBoardRejectsCyclesAndBadIDs(t *testing.T) {
	_, p := newTestProject(t)

	cyclic := testBoard("board1")
	cyclic.Edges = append(cyclic.Edges, BoardEdge{From: "create-org", To: "create-user"})
	if err := p.SaveBoard(cyclic); err == nil {
		t.Fatal("want error for cyclic board")
	}

	for _, id := range []string{"", "../escape", "a/b", "a b"} {
		b := testBoard("x")
		b.ID = id
		if err := p.SaveBoard(b); err == nil {
			t.Fatalf("want error for board id %q", id)
		}
	}
	if _, err := p.Board("../escape"); err == nil {
		t.Fatal("want error for path-traversal board id")
	}
}

func TestBoardNewerFormatVersionRejected(t *testing.T) {
	_, p := newTestProject(t)
	path := filepath.Join(p.Dir(), boardsDirName, "future.json")
	future := fmt.Sprintf(`{"formatVersion": %d, "id": "future", "name": "F", "nodes": [], "edges": []}`, BoardFormatVersion+1)
	if err := os.WriteFile(path, []byte(future), 0o644); err != nil {
		t.Fatalf("write: %v", err)
	}
	if _, err := p.Board("future"); err == nil {
		t.Fatal("want error for newer board format version")
	}
}

func TestBoardUnknownID(t *testing.T) {
	_, p := newTestProject(t)
	if _, err := p.Board("missing"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
}

// TestConcurrentSaves exercises the coarse per-project mutex; run with -race.
func TestConcurrentSaves(t *testing.T) {
	m, p := newTestProject(t)

	const writers = 8
	const iterations = 20
	var wg sync.WaitGroup
	for w := range writers {
		wg.Add(1)
		go func(w int) {
			defer wg.Done()
			for i := range iterations {
				board := testBoard("shared")
				board.Name = fmt.Sprintf("writer-%d-%d", w, i)
				if err := p.SaveBoard(board); err != nil {
					t.Errorf("SaveBoard: %v", err)
				}
				if err := p.SaveEnvironments([]Environment{{Name: fmt.Sprintf("env-%d", w), BaseURL: "http://x"}}); err != nil {
					t.Errorf("SaveEnvironments: %v", err)
				}
			}
		}(w)
	}
	// Concurrent handle fetches must return the same *Project (shared mutex).
	other, err := m.Project(p.ID())
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if other != p {
		t.Fatal("Manager returned a second handle for the same project")
	}
	wg.Wait()

	// After the dust settles every file must still be intact JSON.
	if _, err := p.Board("shared"); err != nil {
		t.Fatalf("Board after concurrent saves: %v", err)
	}
	if _, err := p.Environments(); err != nil {
		t.Fatalf("Environments after concurrent saves: %v", err)
	}
}
