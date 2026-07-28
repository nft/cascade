package binding

import "fmt"

// PathNotFoundError reports an accessor path that does not exist in the
// referenced output. Hint describes what is present at the failing point
// (sibling keys, array length, leaf type) and is meant to be shown verbatim
// in the UI.
type PathNotFoundError struct {
	Node string
	Path string
	Hint string
}

func (e *PathNotFoundError) Error() string {
	// An empty path is the whole-output reference ({{res}}), which cannot be
	// "not found" — the output exists, it just cannot be read. Saying so keeps
	// the truncated-body case from reading `path "" not found`.
	subject := fmt.Sprintf("path %q not found in output of node %q", e.Path, e.Node)
	if e.Path == "" {
		subject = fmt.Sprintf("cannot read the output of node %q", e.Node)
	}
	if e.Hint == "" {
		return "binding: " + subject
	}
	return fmt.Sprintf("binding: %s (%s)", subject, e.Hint)
}

// UpstreamNotRunError reports a reference to a node that has no captured
// output (never ran, failed, or was skipped).
type UpstreamNotRunError struct {
	Node string
}

func (e *UpstreamNotRunError) Error() string {
	return fmt.Sprintf("binding: node %q has not produced an output", e.Node)
}

// AmbiguousResError reports a bare res reference on a node that does not
// have exactly one direct upstream.
type AmbiguousResError struct {
	Upstreams int
}

func (e *AmbiguousResError) Error() string {
	if e.Upstreams == 0 {
		return "binding: res used with no upstream node"
	}
	return fmt.Sprintf("binding: res is ambiguous with %d upstream nodes; use {{nodeKey.path}}", e.Upstreams)
}

// NotAncestorError reports a reference to a node that is not a transitive
// ancestor of the referencing node (edit-time validation).
type NotAncestorError struct {
	Node string
}

func (e *NotAncestorError) Error() string {
	return fmt.Sprintf("binding: node %q is not an upstream ancestor of the referencing node", e.Node)
}
