// Package infer derives a JSON schema from a sample JSON value (plan 05 §8):
// the binding picker needs a navigable tree even when an OpenAPI spec has no
// (or wrong) response schemas, and ad-hoc HTTP nodes have no spec at all.
// Output is deterministic — properties marshal in sorted key order and type
// unions are sorted — so inferred schemas diff cleanly in git.
package infer

import (
	"encoding/json"
	"math"
	"regexp"
	"sort"
	"time"
)

// Type names follow JSON Schema.
const (
	TypeObject  = "object"
	TypeArray   = "array"
	TypeString  = "string"
	TypeNumber  = "number"
	TypeInteger = "integer"
	TypeBoolean = "boolean"
)

// Format guesses for string values (plan 05: strict matches only).
const (
	FormatUUID     = "uuid"
	FormatEmail    = "email"
	FormatDateTime = "date-time"
)

// MaxDepth caps recursion; values nested deeper infer as an untyped schema
// (accepts anything) instead of recursing forever on pathological inputs.
const MaxDepth = 20

// maxSafeInteger mirrors JavaScript's Number.MAX_SAFE_INTEGER: beyond it a
// whole float64 may not represent an integer exactly, so we call it a number.
const maxSafeInteger = 1<<53 - 1

var (
	uuidRe  = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	emailRe = regexp.MustCompile(`^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$`)
)

// Schema is an inferred JSON schema node. Types is a sorted union (usually a
// single element); Nullable marks values seen as null or absent in some array
// elements. A zero Schema means "anything".
type Schema struct {
	Types      []string
	Format     string
	Nullable   bool
	Properties map[string]*Schema
	Items      *Schema
}

// schemaJSON is the wire form: "type" collapses to a plain string for the
// common single-type case. encoding/json marshals map keys sorted, which is
// what makes golden output deterministic.
type schemaJSON struct {
	Type       any                `json:"type,omitempty"`
	Format     string             `json:"format,omitempty"`
	Nullable   bool               `json:"nullable,omitempty"`
	Properties map[string]*Schema `json:"properties,omitempty"`
	Items      *Schema            `json:"items,omitempty"`
}

func (s Schema) MarshalJSON() ([]byte, error) {
	doc := schemaJSON{Format: s.Format, Nullable: s.Nullable, Properties: s.Properties, Items: s.Items}
	switch len(s.Types) {
	case 0:
	case 1:
		doc.Type = s.Types[0]
	default:
		doc.Type = s.Types
	}
	return json.Marshal(doc)
}

func (s *Schema) UnmarshalJSON(data []byte) error {
	var doc schemaJSON
	if err := json.Unmarshal(data, &doc); err != nil {
		return err
	}
	*s = Schema{Format: doc.Format, Nullable: doc.Nullable, Properties: doc.Properties, Items: doc.Items}
	switch t := doc.Type.(type) {
	case string:
		s.Types = []string{t}
	case []any:
		for _, v := range t {
			if name, ok := v.(string); ok {
				s.Types = append(s.Types, name)
			}
		}
		sort.Strings(s.Types)
	}
	return nil
}

// Infer walks a decoded JSON value (the encoding/json any shapes: nil, bool,
// float64, string, []any, map[string]any) and produces its schema. Array item
// schemas are merged across all elements: union of keys, Nullable where a key
// is absent or null in some elements.
func Infer(sample any) *Schema {
	return infer(sample, 0)
}

// InferJSON decodes raw JSON and infers its schema.
func InferJSON(raw []byte) (*Schema, error) {
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		return nil, err
	}
	return Infer(v), nil
}

func infer(v any, depth int) *Schema {
	if depth >= MaxDepth {
		return &Schema{}
	}
	switch t := v.(type) {
	case nil:
		return &Schema{Nullable: true}
	case bool:
		return &Schema{Types: []string{TypeBoolean}}
	case float64:
		if t == math.Trunc(t) && math.Abs(t) <= maxSafeInteger {
			return &Schema{Types: []string{TypeInteger}}
		}
		return &Schema{Types: []string{TypeNumber}}
	case string:
		return &Schema{Types: []string{TypeString}, Format: guessFormat(t)}
	case []any:
		s := &Schema{Types: []string{TypeArray}}
		for _, el := range t {
			s.Items = merge(s.Items, infer(el, depth+1))
		}
		return s
	case map[string]any:
		s := &Schema{Types: []string{TypeObject}, Properties: make(map[string]*Schema, len(t))}
		for k, el := range t {
			s.Properties[k] = infer(el, depth+1)
		}
		return s
	}
	// Not a decoded-JSON shape (e.g. a struct passed directly): untyped.
	return &Schema{}
}

func guessFormat(s string) string {
	switch {
	case uuidRe.MatchString(s):
		return FormatUUID
	case emailRe.MatchString(s):
		return FormatEmail
	default:
		if _, err := time.Parse(time.RFC3339, s); err == nil {
			return FormatDateTime
		}
		return ""
	}
}

// merge combines two element schemas from the same array.
func merge(a, b *Schema) *Schema {
	if a == nil {
		return b
	}
	if b == nil {
		return a
	}
	out := &Schema{
		Types:    mergeTypes(a.Types, b.Types),
		Nullable: a.Nullable || b.Nullable,
	}
	if a.Format == b.Format {
		out.Format = a.Format
	}
	if a.Properties != nil || b.Properties != nil {
		out.Properties = mergeProperties(a.Properties, b.Properties)
	}
	if a.Items != nil || b.Items != nil {
		out.Items = merge(a.Items, b.Items)
	}
	return out
}

func mergeTypes(a, b []string) []string {
	set := make(map[string]bool, len(a)+len(b))
	for _, t := range a {
		set[t] = true
	}
	for _, t := range b {
		set[t] = true
	}
	// integer is a subset of number; a union of both is just number.
	if set[TypeInteger] && set[TypeNumber] {
		delete(set, TypeInteger)
	}
	out := make([]string, 0, len(set))
	for t := range set {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}

func mergeProperties(a, b map[string]*Schema) map[string]*Schema {
	out := make(map[string]*Schema, len(a)+len(b))
	for k, s := range a {
		if other, ok := b[k]; ok {
			out[k] = merge(s, other)
			continue
		}
		// Key absent in a sibling element: nullable, per plan 05 §8.
		c := *s
		c.Nullable = true
		out[k] = &c
	}
	for k, s := range b {
		if _, ok := a[k]; ok {
			continue
		}
		c := *s
		c.Nullable = true
		out[k] = &c
	}
	return out
}
