package binding

import (
	"errors"
	"reflect"
	"testing"
)

// [*] array-map goldens: each case is one accessor path
// resolved against the same captured output.
func TestWildcardPaths(t *testing.T) {
	out := &Output{
		Status: 200,
		Body: map[string]any{
			"orgs": []any{
				map[string]any{"id": "o1", "tags": []any{"a", "b"}},
				map[string]any{"id": "o2", "tags": []any{}},
			},
			"empty": []any{},
			"count": float64(2),
		},
	}
	env := &Env{Outputs: map[string]*Output{"n": out}}

	golden := []struct {
		path string
		want any
	}{
		{"body.orgs[*].id", []any{"o1", "o2"}},
		{"orgs[*].id", []any{"o1", "o2"}}, // body prefix optional, as everywhere
		{"body.orgs[*]", []any{
			map[string]any{"id": "o1", "tags": []any{"a", "b"}},
			map[string]any{"id": "o2", "tags": []any{}},
		}},
		{"body.orgs[*].tags[*]", []any{[]any{"a", "b"}, []any{}}}, // nested [*] nests arrays
		{"body.orgs[*].tags[0]", nil},                             // error: second element has no [0]
		{"body.empty[*].id", []any{}},
		{"body.count[*]", nil}, // error: [*] on a number
	}
	for _, g := range golden {
		got, err := NewRef("n", g.path).Resolve(env)
		if g.want == nil {
			var nf *PathNotFoundError
			if !errors.As(err, &nf) {
				t.Errorf("%s: want PathNotFoundError, got value %#v, err %v", g.path, got, err)
			}
			continue
		}
		if err != nil {
			t.Errorf("%s: %v", g.path, err)
			continue
		}
		if !reflect.DeepEqual(got, g.want) {
			t.Errorf("%s: got %#v, want %#v", g.path, got, g.want)
		}
	}
}

// An export whose path uses [*] resolves like any other export, and further
// segments after the export key keep working ("orgIds[0]").
func TestWildcardThroughExport(t *testing.T) {
	out := &Output{Body: map[string]any{
		"orgs": []any{map[string]any{"id": "o1"}, map[string]any{"id": "o2"}},
	}}
	env := &Env{
		Outputs: map[string]*Output{"n": out},
		Exports: map[string][]Export{"n": {{Key: "orgIds", Path: "body.orgs[*].id"}}},
	}
	got, err := NewRef("n", "orgIds").Resolve(env)
	if err != nil {
		t.Fatalf("orgIds: %v", err)
	}
	if !reflect.DeepEqual(got, []any{"o1", "o2"}) {
		t.Fatalf("orgIds: got %#v", got)
	}
	first, err := NewRef("n", "orgIds[0]").Resolve(env)
	if err != nil || first != "o1" {
		t.Fatalf("orgIds[0]: got %#v, %v", first, err)
	}
}
