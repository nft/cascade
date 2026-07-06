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
	if e.Hint == "" {
		return fmt.Sprintf("binding: path %q not found in output of node %q", e.Path, e.Node)
	}
	return fmt.Sprintf("binding: path %q not found in output of node %q (%s)", e.Path, e.Node, e.Hint)
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
