// Package nodespec is the typed reading of a board node's form data. The
// store carries that data opaquely (store.BoardNode.Data) because the
// frontend owns the format; this package is the one Go-side interpreter of
// it, shared by the executor and the exporter. Keys mirror
// frontend/src/lib/model.ts, which stays the source of truth.
//
// It must not import cascade/store — store imports core, and the engine has
// to stay usable from a headless runner that never opens a workspace.
package nodespec

import (
	"fmt"
	"time"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/httpcall"
	"cascade/core/transform"
)

// HTTPSpec is an http node's request configuration. Fields is an ordered
// slice, not a map: node.data.fields is an ordered array and
// transform.SetKeyPath is last-wins for conflicting dot paths, so "body.user"
// against "body.user.name" would resolve nondeterministically under Go's map
// iteration.
type HTTPSpec struct {
	Protocol    string
	Method      string
	Path        string
	Origin      string
	Environment string
	Credential  string
	Fields      []Field
	RawBody     *httpcall.RawBody
}

// TransformSpec is a transform node's configuration: declarative pick rows or
// a sandboxed script, selected by Mode.
type TransformSpec struct {
	Mode   string
	Pick   []Field
	Script string
}

// Engine converts pick rows into the transform package's spec. Pick rows
// reuse the request-field shape, so they need the same source translation
// request fields do.
func (s TransformSpec) Engine() (transform.Spec, error) {
	spec := transform.Spec{Mode: transform.Mode(s.Mode), Script: s.Script}
	// The inspector hides pick rows in script mode but keeps them for a switch
	// back, so a row there — even one an export cut — runs nothing and must
	// fail nothing.
	if !s.picks() {
		return spec, nil
	}
	for _, f := range s.Pick {
		source, err := f.sourceToRun()
		if err != nil {
			return transform.Spec{}, fmt.Errorf("pick %q: %w", f.Key, err)
		}
		spec.Pick = append(spec.Pick, transform.PickRow{Key: f.Key, Source: source})
	}
	return spec, nil
}

// picks reports whether the pick rows are what runs. An empty mode is pick,
// the default, as transform.Execute reads it.
func (s TransformSpec) picks() bool {
	mode := transform.Mode(s.Mode)
	return mode == transform.ModePick || mode == ""
}

// MockSpec is a mock node's authored output. Body is JSON *text* (model.ts
// MockNodeData.body is a string), parsed at dispatch so a typo fails only
// that node.
type MockSpec struct {
	Body   string
	Status int
}

// DelaySpec is a delay node's wait.
type DelaySpec struct {
	DurationMs int
}

// Duration is the wait as a time.Duration; out-of-range values are rejected
// by Validate and again at dispatch.
func (s DelaySpec) Duration() time.Duration {
	return time.Duration(s.DurationMs) * time.Millisecond
}

// LoopSpec is a for node's configuration: run the body Count times, or (each
// mode) once per element of the array Source resolves to.
type LoopSpec struct {
	Mode   string
	Count  int
	Source *Ref
}

// SourceRef maps the each-mode source into the engine's ref shape; a nil
// Source is the zero Ref, i.e. the res sugar.
func (s LoopSpec) SourceRef() binding.Ref {
	if s.Source == nil {
		return binding.Ref{}
	}
	return s.Source.Binding()
}

// RequestRef is a node's collection provenance link (plan 08). Read by the
// exporter's deriveRequires; the executor ignores it.
type RequestRef struct {
	CollectionID string `json:"collectionId"`
	RequestID    string `json:"requestId"`
}

// Spec is one node's typed configuration. Exactly one of the pointers is set,
// selected by Kind; note nodes set none.
type Spec struct {
	Kind       core.NodeType
	Key        string
	Exports    []binding.Export
	RequestRef *RequestRef

	HTTP      *HTTPSpec
	Transform *TransformSpec
	Mock      *MockSpec
	Delay     *DelaySpec
	Loop      *LoopSpec
}

// Refs returns every node reference the spec makes, in order — {{i}} and
// {{item}} are loop-scope values, not node references, and never appear here.
//
// It answers "what does this node depend on", not "where in this node". The
// result is a flat concatenation across every field with no row or token
// identity, so a caller that has to REWRITE a reference (share's export, for
// one) cannot use it and reads Field.Ref and binding.TemplateSpans instead.
func (s Spec) Refs() ([]binding.Ref, error) {
	var refs []binding.Ref
	collect := func(fields []Field) error {
		for _, f := range fields {
			source, err := f.BindingSource()
			if err != nil {
				return fmt.Errorf("field %q: %w", f.Key, err)
			}
			found, err := source.Refs()
			if err != nil {
				return fmt.Errorf("field %q: %w", f.Key, err)
			}
			refs = append(refs, found...)
		}
		return nil
	}
	switch {
	case s.HTTP != nil:
		if err := collect(s.HTTP.Fields); err != nil {
			return nil, err
		}
		if s.HTTP.RawBody != nil {
			found, err := binding.TemplateRefs(s.HTTP.RawBody.Text)
			if err != nil {
				return nil, fmt.Errorf("raw body: %w", err)
			}
			refs = append(refs, found...)
		}
	case s.Transform != nil:
		if err := collect(s.Transform.Pick); err != nil {
			return nil, err
		}
	case s.Loop != nil:
		// Only an explicit source is a reference. A nil source means the res
		// sugar, which is carried by the edge and cannot dangle.
		if s.Loop.Source != nil {
			refs = append(refs, s.Loop.SourceRef())
		}
	}
	return refs, nil
}
