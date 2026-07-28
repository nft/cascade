package nodespec

import (
	"errors"
	"strings"
	"testing"

	"cascade/core/binding"
)

func TestFieldSection(t *testing.T) {
	cases := []struct {
		key     string
		section Section
		name    string
		errText string
	}{
		{key: "path.id", section: SectionPath, name: "id"},
		{key: "query.limit", section: SectionQuery, name: "limit"},
		{key: "header.X-Api-Key", section: SectionHeader, name: "X-Api-Key"},
		{key: "body.amount", section: SectionBody, name: "amount"},
		// Only the FIRST dot is the separator: body keys nest through the rest.
		{key: "body.user.name", section: SectionBody, name: "user.name"},
		{key: "query.filter.tag", section: SectionQuery, name: "filter.tag"},
		{key: "amount", errText: "no section prefix"},
		{key: "", errText: "no section prefix"},
		{key: "cookie.session", errText: "no section prefix"},
		{key: ".id", errText: "no section prefix"},
		{key: "body.", errText: "no name"},
	}
	for _, tc := range cases {
		t.Run(tc.key, func(t *testing.T) {
			section, name, err := Field{Key: tc.key}.Section()
			if tc.errText != "" {
				if err == nil || !strings.Contains(err.Error(), tc.errText) {
					t.Fatalf("err = %v, want one containing %q", err, tc.errText)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if section != tc.section || name != tc.name {
				t.Errorf("got (%q, %q), want (%q, %q)", section, name, tc.section, tc.name)
			}
		})
	}
}

// The message has to name the fix: a key without a prefix cannot be rendered
// by the editor either, so the user has to re-add the row to see it at all.
func TestFieldSectionMessageNamesTheFix(t *testing.T) {
	_, _, err := Field{Key: "amount"}.Section()
	if err == nil {
		t.Fatal("want an error")
	}
	for _, want := range []string{`"amount"`, "Body", "Params", "Headers"} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("message %q is missing %q", err, want)
		}
	}
}

func TestFieldBindingSource(t *testing.T) {
	cases := []struct {
		name  string
		field Field
		want  binding.Source
	}{{
		name:  "literal",
		field: Field{Key: "query.q", Source: FieldLiteral, Value: "hello"},
		want:  binding.Literal("hello"),
	}, {
		name:  "template",
		field: Field{Key: "query.q", Source: FieldTemplate, Value: "u-{{i}}"},
		want:  binding.Template("u-{{i}}"),
	}, {
		name: "binding",
		field: Field{
			Key: "path.id", Source: FieldBinding, Value: "n1.body.id",
			Ref: &Ref{NodeID: "n1", Path: "body.id"},
		},
		want: binding.NewRef("n1", "body.id"),
	}, {
		// The res sugar keeps its empty node: which node it means is carried
		// by the edge, not the stored ref.
		name: "res sugar",
		field: Field{
			Key: "path.id", Source: FieldBinding, Value: "res.body.id",
			Ref: &Ref{Path: "body.id"},
		},
		want: binding.NewRef("", "body.id"),
	}, {
		name:  "an unset source is a literal",
		field: Field{Key: "query.q", Value: "raw"},
		want:  binding.Literal("raw"),
	}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.field.BindingSource()
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Errorf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestFieldBindingSourceRejects(t *testing.T) {
	t.Run("a bound field with no ref", func(t *testing.T) {
		_, err := Field{Key: "path.id", Source: FieldBinding, Value: "n1.body.id"}.BindingSource()
		if !errors.Is(err, errNoRef) {
			t.Fatalf("err = %v, want errNoRef", err)
		}
	})
	t.Run("an unrecognized source", func(t *testing.T) {
		// board.ts degrades this to a literal when a board loads; the engine
		// does not, because sending the stored text as a value would put the
		// wrong bytes on the wire under the user's nose.
		_, err := Field{Key: "query.q", Source: "expression", Value: "1+1"}.BindingSource()
		if err == nil || !strings.Contains(err.Error(), "unknown field source") {
			t.Fatalf("err = %v, want an unknown-source error", err)
		}
	})
}
