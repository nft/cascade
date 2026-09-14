package share

import (
	"bytes"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"cascade/store"
)

var updateGolden = flag.Bool("update", false, "rewrite the golden envelope from this build")

const goldenPath = "testdata/selection.json"

// templateBoard is the fixture the golden pins: a chain whose second node
// carries every template shape the rewrite has to reason about, so cutting
// n1 out of the selection exercises all of them at once.
func templateBoard() store.Board {
	return store.Board{
		ID:   "b3",
		Name: "Template shapes",
		Nodes: []store.BoardNode{
			{ID: "n1", Type: "http", Name: "Create User", Data: map[string]any{
				"name": "Create User", "key": "createUser", "method": "POST", "path": "/v1/users",
				"environment": "staging", "credential": "staging-admin", "repeat": 1,
			}},
			{ID: "n2", Type: "http", Name: "Create Invoice", Data: map[string]any{
				"name": "Create Invoice", "key": "createInvoice", "method": "POST", "path": "/v1/invoices",
				"environment": "local", "repeat": 1,
				"fields": []any{
					// Padding inside the braces: a dangling token is rewritten,
					// so its spacing goes, but the {{i}} beside it must not be
					// reformatted on the way past.
					map[string]any{
						"key": "body.padded", "source": "template",
						"value": "a{{ n1.body.id }}b{{ i }}c",
					},
					// Loop-scope tokens are not node references.
					map[string]any{
						"key": "body.loop", "source": "template",
						"value": "{{item}}/{{item.name}}/{{i}}",
					},
					// res sugar, both spellings: the bracket form resolves to
					// the same owner as the dotted one.
					map[string]any{
						"key": "body.res", "source": "template",
						"value": "{{res.body.id}} {{res[0].id}}",
					},
					// A node id that is not on this board at all: nothing to
					// dangle against, so it travels verbatim.
					map[string]any{
						"key": "body.foreign", "source": "template",
						"value": "{{ghost.body.id}}",
					},
					// An index path on a real upstream keeps its brackets.
					map[string]any{
						"key": "body.indexed", "source": "template",
						"value": "{{n1.body.items[0].id}}",
					},
					// Structured bindings travel the same rewrite.
					map[string]any{
						"key": "body.userId", "source": "binding", "value": "createUser.body.id",
						"ref": map[string]any{"nodeId": "n1", "path": "body.id"},
					},
				},
			}},
		},
		Edges:  []store.BoardEdge{{ID: "e1", From: "n1", To: "n2"}},
		Layout: store.BoardLayout{Positions: map[string]store.Position{"n1": {X: 0, Y: 0}, "n2": {X: 300, Y: 40}}},
	}
}

// TestGoldenEnvelope pins the exported bytes against a recorded file. Every
// other assertion in this package compares an export to another export from
// the SAME build, so a change that reorders keys, normalizes template spacing
// or drops a key nothing models passes all of them. This one does not.
//
// Regenerate with `go test ./share -run GoldenEnvelope -update` and read the
// diff before committing it: a change here is a change to what leaves the
// machine.
func TestGoldenEnvelope(t *testing.T) {
	p := newTestProject(t)
	// n1 is cut, so every reference in n2 points outside the selection.
	got, err := ExportSelection(p, templateBoard(), []string{"n2"})
	if err != nil {
		t.Fatalf("ExportSelection: %v", err)
	}
	if *updateGolden {
		if err := os.MkdirAll(filepath.Dir(goldenPath), 0o755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		if err := os.WriteFile(goldenPath, got, 0o644); err != nil {
			t.Fatalf("WriteFile: %v", err)
		}
		t.Logf("rewrote %s", goldenPath)
		return
	}
	want, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("ReadFile %s: %v (run with -update to record it)", goldenPath, err)
	}
	if !bytes.Equal(got, want) {
		t.Errorf("envelope differs from %s:\n--- want ---\n%s\n--- got ---\n%s", goldenPath, want, got)
	}
}
