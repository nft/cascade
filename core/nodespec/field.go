package nodespec

import (
	"errors"
	"fmt"
	"strings"

	"cascade/core/binding"
)

// errNoRef reports a field that claims to be bound but names no upstream
// value. board.ts's migrateField back-fills the legacy spelling when a board
// loads, so a field still missing its ref here cannot be resolved at all.
var errNoRef = errors.New("bound field has no reference — re-pick its upstream value")

// danglingFormat refuses a field whose binding a selection export cut. The
// exporter leaves an empty literal plus a marker naming what it was bound to;
// sending that empty value would be the silent wrong value the marker exists
// to prevent. refs.ts danglingFieldMessage shows the same words in the
// inspector, and a guard test keeps the two in step.
const danglingFormat = "lost its binding to %s — re-bind it"

// FieldSource mirrors model.ts FieldSource: how one request field or pick row
// gets its value.
type FieldSource string

const (
	FieldLiteral  FieldSource = "literal"
	FieldBinding  FieldSource = "binding"
	FieldTemplate FieldSource = "template"
)

// Ref mirrors model.ts FieldRef — the FRONTEND spelling (nodeId, not node).
// An empty NodeID is the `res` sugar.
type Ref struct {
	NodeID string `json:"nodeId"`
	Path   string `json:"path"`
}

// Binding converts the frontend ref spelling into the engine's.
func (r Ref) Binding() binding.Ref {
	return binding.Ref{Node: r.NodeID, Path: r.Path}
}

// Dangling records what a field was bound to before selection export cut the
// reference. The engine ignores it; it exists so the receiving side
// can offer a re-bind.
type Dangling struct {
	OriginalKey string `json:"originalKey"`
	Path        string `json:"path"`
}

// Field mirrors model.ts NodeField. Value carries both literal text and
// template text; which one it is depends on Source.
type Field struct {
	Key      string      `json:"key"`
	Source   FieldSource `json:"source"`
	Value    string      `json:"value"`
	Ref      *Ref        `json:"ref,omitempty"`
	Dangling *Dangling   `json:"dangling,omitempty"`
}

// BindingSource converts the frontend field shape into the engine's value
// source. This is the translation layer that exists nowhere else: three
// spellings differ ('binding' vs KindRef, one Value field carrying both
// literal and template text, ref.nodeId vs Ref.Node).
//
// An unset source reads as a literal, but an unrecognized one is an error
// rather than board.ts's degrade-to-literal: migrateField already normalizes
// legacy spellings when a board loads, so anything still unknown here is a
// value this engine cannot interpret, and sending its raw text as a literal
// would silently put the wrong bytes on the wire.
func (f Field) BindingSource() (binding.Source, error) {
	switch f.Source {
	case FieldLiteral, "":
		return binding.Literal(f.Value), nil
	case FieldTemplate:
		return binding.Template(f.Value), nil
	case FieldBinding:
		if f.Ref == nil {
			return binding.Source{}, errNoRef
		}
		return binding.NewRef(f.Ref.NodeID, f.Ref.Path), nil
	}
	return binding.Source{}, fmt.Errorf("unknown field source %q", f.Source)
}

// sourceToRun is BindingSource for every path that produces a value. It
// differs in one case: a field a selection export unbound still describes a
// source — an empty literal, which is why Refs lists no dependency for it —
// but must not be RUN as one.
func (f Field) sourceToRun() (binding.Source, error) {
	if f.Dangling != nil {
		return binding.Source{}, fmt.Errorf(danglingFormat, binding.RefExpr(f.Dangling.OriginalKey, f.Dangling.Path))
	}
	return f.BindingSource()
}

// Section is the request part a field key's prefix selects.
type Section string

const (
	SectionPath   Section = "path"
	SectionQuery  Section = "query"
	SectionHeader Section = "header"
	SectionBody   Section = "body"
)

const (
	// sectionSeparator splits a field key's prefix from its name.
	sectionSeparator = "."
	// noSectionPrefixFormat names the fix, because a key without a prefix
	// cannot be displayed by the editor either: the user has to re-add the
	// row before they can see or edit it.
	noSectionPrefixFormat = "field %q has no section prefix — re-add it under Body, Params or Headers"
	emptyFieldNameFormat  = "field %q has a %q prefix but no name"
)

// Section splits a field key on its FIRST dot: "body.user.name" yields
// (SectionBody, "user.name"). A key with no recognized prefix is an error —
// the editor cannot display such a row, so silently dropping it would send a
// request the user believes carries a field it does not.
func (f Field) Section() (Section, string, error) {
	prefix, name, found := strings.Cut(f.Key, sectionSeparator)
	if !found {
		return "", "", fmt.Errorf(noSectionPrefixFormat, f.Key)
	}
	section := Section(prefix)
	switch section {
	case SectionPath, SectionQuery, SectionHeader, SectionBody:
	default:
		return "", "", fmt.Errorf(noSectionPrefixFormat, f.Key)
	}
	if name == "" {
		return "", "", fmt.Errorf(emptyFieldNameFormat, f.Key, prefix)
	}
	return section, name, nil
}

// resolve produces the field's value, naming the field in any failure.
// Without the wrapper a log row shows a bare path error with no indication
// which of a node's fields produced it — the same reason
// transform.executePick names its row.
func (f Field) resolve(env *binding.Env) (any, error) {
	source, err := f.sourceToRun()
	if err != nil {
		return nil, fmt.Errorf("field %q: %w", f.Key, err)
	}
	value, err := source.Resolve(env)
	if err != nil {
		return nil, fmt.Errorf("field %q: %w", f.Key, err)
	}
	return value, nil
}
