// Package binding resolves node input values from upstream node outputs
// (M1 WP3, extended by plan 05). A Source is a literal, a structured
// reference to one upstream value, or a template string interpolating
// {{…}} references. References use node IDs — the UI renders user-facing
// node keys, but keys never reach the engine, so key renames are free.
//
// Accessor paths are resolved against a captured Output with this
// precedence (plan 05 §9a/9b): the explicit prefixes "status", "headers"
// (or M1's "header") and "body" always win; otherwise the first segment is
// tried as a named export of the referenced node; otherwise the whole path
// is a body path ("name" ≡ "body.name").
package binding

import (
	"fmt"
	"net/http"
)

// Kind discriminates how a Source produces its value.
type Kind string

const (
	KindLiteral  Kind = "literal"
	KindRef      Kind = "ref"
	KindTemplate Kind = "template"
)

// Ref is one structured reference to an upstream node's output. An empty
// Node means "my single direct upstream" (the res sugar); resolving it with
// any other number of upstreams is an AmbiguousResError. Path is an accessor
// path ("body.id", "status", "headers.Location", or an export key like
// "userId"); an empty Path yields the whole response body.
type Ref struct {
	Node string `json:"node,omitempty"`
	Path string `json:"path,omitempty"`
}

// Source is one node-input value description.
type Source struct {
	Kind     Kind   `json:"kind"`
	Literal  any    `json:"literal,omitempty"`
	Ref      Ref    `json:"ref,omitempty"`
	Template string `json:"template,omitempty"`
}

// Literal builds a literal-valued Source.
func Literal(value any) Source { return Source{Kind: KindLiteral, Literal: value} }

// NewRef builds a single-reference Source.
func NewRef(node, path string) Source { return Source{Kind: KindRef, Ref: Ref{Node: node, Path: path}} }

// Template builds a template Source ("welcome-{{create-user.body.name}}").
func Template(tpl string) Source { return Source{Kind: KindTemplate, Template: tpl} }

// Output is a captured HTTP response downstream nodes bind against.
type Output struct {
	Status int
	Header http.Header
	Body   any
}

// Export is a named alias a node declares for a value of its own response:
// {Key: "userId", Path: "body.data.attributes.id"}. Export paths use only
// the explicit accessor prefixes — an export cannot reference another export.
type Export struct {
	Key  string `json:"key"`
	Path string `json:"path"`
}

// Env is the resolution context for one node's inputs during a run.
type Env struct {
	// Outputs holds captured responses of already-run nodes, by node ID.
	Outputs map[string]*Output
	// Exports holds each node's declared output aliases, by node ID.
	Exports map[string][]Export
	// Upstreams lists the direct upstream node IDs of the node being
	// resolved; the res sugar requires exactly one.
	Upstreams []string
	// Index is the fan-out iteration index, exposed as {{i}} (M6).
	Index int
	// Item is the current each-mode loop element (plan 09), exposed as
	// {{item}} / {{item.path}} to nodes inside a for body. HasItem gates it
	// so a stray {{item}} elsewhere fails with a named error instead of
	// silently resolving to nil.
	Item    any
	HasItem bool
}

// Resolve produces the source's value against the environment. Template
// sources whose entire value is a single {{…}} keep the referenced JSON
// type; mixed text coerces to a string.
func (s Source) Resolve(env *Env) (any, error) {
	switch s.Kind {
	case KindLiteral:
		return s.Literal, nil
	case KindRef:
		return env.resolveRef(s.Ref)
	case KindTemplate:
		return env.resolveTemplate(s.Template)
	}
	return nil, fmt.Errorf("binding: unknown source kind %q", s.Kind)
}

// Refs returns every node reference the source makes ({{i}} is not a node
// reference). Template parse failures surface here so validation can flag
// malformed templates.
func (s Source) Refs() ([]Ref, error) {
	switch s.Kind {
	case KindRef:
		return []Ref{s.Ref}, nil
	case KindTemplate:
		return TemplateRefs(s.Template)
	}
	return nil, nil
}

func (e *Env) resolveRef(r Ref) (any, error) {
	node := r.Node
	if node == "" {
		if len(e.Upstreams) != 1 {
			return nil, &AmbiguousResError{Upstreams: len(e.Upstreams)}
		}
		node = e.Upstreams[0]
	}
	out, ok := e.Outputs[node]
	if !ok || out == nil {
		return nil, &UpstreamNotRunError{Node: node}
	}
	return resolveOutputPath(node, out, e.Exports[node], r.Path)
}
