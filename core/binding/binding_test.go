package binding

import (
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"
)

func body(t *testing.T, raw string) any {
	t.Helper()
	var v any
	if err := json.Unmarshal([]byte(raw), &v); err != nil {
		t.Fatalf("bad fixture JSON: %v", err)
	}
	return v
}

func testEnv(t *testing.T) *Env {
	t.Helper()
	return &Env{
		Outputs: map[string]*Output{
			"create-user": {
				Status: 201,
				Header: http.Header{"Location": []string{"/v1/users/u1"}, "X-Request-Id": []string{"r-42"}},
				Body: body(t, `{
					"id": "u1",
					"name": "Ada",
					"age": 36,
					"active": true,
					"status": "pending",
					"data": {"attributes": {"id": "deep-1"}},
					"items": [{"id": "i0"}, {"id": "i1"}],
					"ключ": "unicode"
				}`),
			},
			"create-org": {Status: 200, Header: http.Header{}, Body: body(t, `{"id": "o1"}`)},
		},
		Exports: map[string][]Export{
			"create-user": {{Key: "userId", Path: "body.data.attributes.id"}, {Key: "user", Path: "body.data"}},
		},
		Upstreams: []string{"create-user"},
		Index:     3,
	}
}

func TestResolvePathTable(t *testing.T) {
	env := testEnv(t)
	cases := []struct {
		name string
		src  Source
		want any
	}{
		{"res is body sugar", NewRef("", "name"), "Ada"},
		{"res bare yields whole body", NewRef("", ""), env.Outputs["create-user"].Body},
		{"res status prefix wins over body key", NewRef("", "status"), 201},
		{"body-key named status stays reachable", NewRef("", "body.status"), "pending"},
		{"headers case-insensitive", NewRef("", "headers.location"), "/v1/users/u1"},
		{"header singular alias", NewRef("", "header.X-Request-Id"), "r-42"},
		{"qualified deep path", NewRef("create-user", "body.data.attributes.id"), "deep-1"},
		{"array index", NewRef("create-user", "body.items[1].id"), "i1"},
		{"unicode key", NewRef("create-user", "body.ключ"), "unicode"},
		{"response prefix accepted", NewRef("create-user", "response.body.id"), "u1"},
		{"export alias", NewRef("create-user", "userId"), "deep-1"},
		{"export with trailing path", NewRef("create-user", "user.attributes.id"), "deep-1"},
		{"unprefixed qualified path is body", NewRef("create-user", "name"), "Ada"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.src.Resolve(env)
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %#v, want %#v", got, tc.want)
			}
		})
	}
}

func TestResolveErrors(t *testing.T) {
	env := testEnv(t)

	t.Run("missing leaf hints sibling keys", func(t *testing.T) {
		_, err := NewRef("create-user", "body.nam").Resolve(env)
		var pnf *PathNotFoundError
		if !errors.As(err, &pnf) {
			t.Fatalf("want PathNotFoundError, got %v", err)
		}
		if !strings.Contains(pnf.Hint, "name") {
			t.Fatalf("hint %q should list sibling keys", pnf.Hint)
		}
	})

	t.Run("missing branch reports leaf type", func(t *testing.T) {
		_, err := NewRef("create-user", "body.name.first").Resolve(env)
		var pnf *PathNotFoundError
		if !errors.As(err, &pnf) {
			t.Fatalf("want PathNotFoundError, got %v", err)
		}
		if !strings.Contains(pnf.Hint, "string") {
			t.Fatalf("hint %q should name the leaf type", pnf.Hint)
		}
	})

	t.Run("index out of range", func(t *testing.T) {
		_, err := NewRef("create-user", "body.items[9].id").Resolve(env)
		var pnf *PathNotFoundError
		if !errors.As(err, &pnf) {
			t.Fatalf("want PathNotFoundError, got %v", err)
		}
	})

	t.Run("upstream not run", func(t *testing.T) {
		_, err := NewRef("never-ran", "body.id").Resolve(env)
		var nr *UpstreamNotRunError
		if !errors.As(err, &nr) || nr.Node != "never-ran" {
			t.Fatalf("want UpstreamNotRunError{never-ran}, got %v", err)
		}
	})

	t.Run("res ambiguous with two upstreams", func(t *testing.T) {
		multi := testEnv(t)
		multi.Upstreams = []string{"create-user", "create-org"}
		_, err := NewRef("", "name").Resolve(multi)
		var amb *AmbiguousResError
		if !errors.As(err, &amb) || amb.Upstreams != 2 {
			t.Fatalf("want AmbiguousResError{2}, got %v", err)
		}
	})

	t.Run("res with no upstream", func(t *testing.T) {
		none := testEnv(t)
		none.Upstreams = nil
		_, err := NewRef("", "name").Resolve(none)
		var amb *AmbiguousResError
		if !errors.As(err, &amb) {
			t.Fatalf("want AmbiguousResError, got %v", err)
		}
	})

	t.Run("exports cannot chain", func(t *testing.T) {
		chained := testEnv(t)
		chained.Exports["create-user"] = append(chained.Exports["create-user"], Export{Key: "alias", Path: "userId"})
		_, err := NewRef("create-user", "alias").Resolve(chained)
		if err == nil {
			t.Fatal("export resolving through another export should fail")
		}
	})
}

func TestTemplates(t *testing.T) {
	env := testEnv(t)
	cases := []struct {
		name string
		tpl  string
		want any
	}{
		{"whole-value ref keeps number type", "{{create-user.body.age}}", float64(36)},
		{"whole-value ref keeps bool type", "{{create-user.body.active}}", true},
		{"whole-value res export", "{{res.userId}}", "deep-1"},
		{"mixed text coerces number", "age: {{create-user.body.age}}", "age: 36"},
		{"interpolated literal", "{{create-user.body.name}} (copy)", "Ada (copy)"},
		{"iteration index", "member+{{i}}@example.com", "member+3@example.com"},
		{"whole-value index keeps int", "{{i}}", 3},
		{"object interpolates as JSON", "v={{create-user.body.data.attributes}}", `v={"id":"deep-1"}`},
		{"whitespace inside braces", "{{ res.name }}", "Ada"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Template(tc.tpl).Resolve(env)
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %#v, want %#v", got, tc.want)
			}
		})
	}

	t.Run("unterminated braces error", func(t *testing.T) {
		if _, err := Template("hello {{res.name").Resolve(env); err == nil {
			t.Fatal("want error for unterminated {{")
		}
	})

	t.Run("empty reference errors", func(t *testing.T) {
		if _, err := Template("x{{}}y").Resolve(env); err == nil {
			t.Fatal("want error for empty {{}}")
		}
	})
}

func TestItemTemplates(t *testing.T) {
	env := &Env{
		Item:    map[string]any{"name": "ada", "ids": []any{"a", "b"}},
		HasItem: true,
	}
	cases := []struct {
		name string
		tpl  string
		want any
	}{
		{"whole item", "{{item}}", map[string]any{"name": "ada", "ids": []any{"a", "b"}}},
		{"item path", "{{item.name}}", "ada"},
		{"item index path", "{{item.ids[1]}}", "b"},
		{"mixed text", "hi {{item.name}}", "hi ada"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Template(tc.tpl).Resolve(env)
			if err != nil {
				t.Fatalf("Resolve: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %#v, want %#v", got, tc.want)
			}
		})
	}

	t.Run("bare item over a primitive element", func(t *testing.T) {
		got, err := Template("{{item}}").Resolve(&Env{Item: "foo", HasItem: true})
		if err != nil || got != "foo" {
			t.Fatalf("got %v, %v", got, err)
		}
	})

	t.Run("item outside an each-mode loop is a named error", func(t *testing.T) {
		_, err := Template("{{item}}").Resolve(&Env{})
		if err == nil || !strings.Contains(err.Error(), "each-mode") {
			t.Fatalf("want the item-scope error, got %v", err)
		}
	})

	t.Run("item is not a node reference", func(t *testing.T) {
		refs, err := TemplateRefs("{{item.name}}-{{i}}")
		if err != nil {
			t.Fatalf("TemplateRefs: %v", err)
		}
		if len(refs) != 0 {
			t.Fatalf("item/i must not be node refs, got %#v", refs)
		}
	})
}

func TestTemplateRefs(t *testing.T) {
	refs, err := TemplateRefs("{{a.body.id}}-{{i}}-{{res.name}}-{{res}}")
	if err != nil {
		t.Fatalf("TemplateRefs: %v", err)
	}
	want := []Ref{{Node: "a", Path: "body.id"}, {Path: "name"}, {}}
	if !reflect.DeepEqual(refs, want) {
		t.Fatalf("got %#v, want %#v", refs, want)
	}
}

// A bracket ends the owner word too, so res[0] must stay the res sugar
// instead of parsing as a reference to a node literally named "res".
func TestTemplateRefsOverTopLevelArray(t *testing.T) {
	refs, err := TemplateRefs("{{res[0].id}}-{{res[0]}}-{{listUsers[1].id}}")
	if err != nil {
		t.Fatalf("TemplateRefs: %v", err)
	}
	want := []Ref{{Path: "[0].id"}, {Path: "[0]"}, {Node: "listUsers", Path: "[1].id"}}
	if !reflect.DeepEqual(refs, want) {
		t.Fatalf("got %#v, want %#v", refs, want)
	}
}

func TestLiteralPassthrough(t *testing.T) {
	got, err := Literal(42).Resolve(&Env{})
	if err != nil || got != 42 {
		t.Fatalf("got %v, %v", got, err)
	}
}

func TestValidateSource(t *testing.T) {
	isAncestor := func(node string) bool { return node == "create-user" }

	if err := ValidateSource(NewRef("create-user", "body.id"), 1, isAncestor); err != nil {
		t.Fatalf("ancestor ref should validate: %v", err)
	}
	if err := ValidateSource(Template("x {{res.name}}"), 1, isAncestor); err != nil {
		t.Fatalf("res with one upstream should validate: %v", err)
	}

	var amb *AmbiguousResError
	if err := ValidateSource(NewRef("", "name"), 2, isAncestor); !errors.As(err, &amb) {
		t.Fatalf("want AmbiguousResError, got %v", err)
	}
	if err := ValidateSource(Template("{{res.name}}"), 0, isAncestor); !errors.As(err, &amb) {
		t.Fatalf("want AmbiguousResError for zero upstreams, got %v", err)
	}

	var na *NotAncestorError
	if err := ValidateSource(NewRef("stranger", "body.id"), 1, isAncestor); !errors.As(err, &na) || na.Node != "stranger" {
		t.Fatalf("want NotAncestorError{stranger}, got %v", err)
	}
	if err := ValidateSource(Template("{{stranger.body.id}}"), 1, isAncestor); !errors.As(err, &na) {
		t.Fatalf("want NotAncestorError from template, got %v", err)
	}

	if err := ValidateSource(Template("{{broken"), 1, isAncestor); err == nil {
		t.Fatal("malformed template should fail validation")
	}
	if err := ValidateSource(Literal("res.name"), 0, isAncestor); err != nil {
		t.Fatalf("literals never validate refs: %v", err)
	}
}
