package binding

// ValidateSource checks the edit-time referential rules for one node's
// input source: a bare res reference requires exactly one
// direct upstream, and every qualified reference must point at a transitive
// ancestor reachable via edges. isAncestor reports whether the given node ID
// is a transitive ancestor of the node owning the source. Malformed
// templates fail here too.
func ValidateSource(s Source, upstreamCount int, isAncestor func(node string) bool) error {
	refs, err := s.Refs()
	if err != nil {
		return err
	}
	for _, ref := range refs {
		if ref.Node == "" {
			if upstreamCount != 1 {
				return &AmbiguousResError{Upstreams: upstreamCount}
			}
			continue
		}
		if !isAncestor(ref.Node) {
			return &NotAncestorError{Node: ref.Node}
		}
	}
	return nil
}
