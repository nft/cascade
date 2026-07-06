package binding

import (
	"fmt"
	"net/textproto"
	"sort"
	"strconv"
	"strings"
)

// Accessor prefixes that always win over body keys and export names
// (plan 05 §9a): a body field literally named "status" stays reachable as
// "body.status".
const (
	prefixStatus  = "status"
	prefixHeaders = "headers"
	// prefixHeader is the M1 WP3 singular spelling, kept as an accepted alias.
	prefixHeader = "header"
	prefixBody   = "body"
	// prefixResponse is the M1 canonical path root ("response.body.id");
	// plan 05 accessor paths omit it, so a leading "response." is skipped.
	prefixResponse = "response"
)

// hintKeyCap bounds how many sibling keys a PathNotFoundError hint lists.
const hintKeyCap = 8

// wildcardSegment is the bracket content of the [*] array-map extension
// (plan 06 T3): "orgs[*].id" maps the rest of the path over every element.
const wildcardSegment = "*"

// segment is one step of a parsed accessor path: an object key, an array
// index, or the [*] array map.
type segment struct {
	key     string
	index   int
	isIndex bool
	isWild  bool
}

// parsePath splits a dot/bracket path ("data.items[0].id",
// "orgs[*].id") into segments. Keys may contain any character except '.',
// '[' and ']' (unicode keys are fine); brackets hold a non-negative integer
// index or the [*] wildcard.
func parsePath(path string) ([]segment, error) {
	if path == "" {
		return nil, nil
	}
	var segs []segment
	rest := path
	expectKey := true
	for rest != "" {
		switch {
		case rest[0] == '.':
			if expectKey {
				return nil, fmt.Errorf("binding: empty segment in path %q", path)
			}
			rest = rest[1:]
			expectKey = true
		case rest[0] == '[':
			end := strings.IndexByte(rest, ']')
			if end < 0 {
				return nil, fmt.Errorf("binding: unclosed '[' in path %q", path)
			}
			if rest[1:end] == wildcardSegment {
				segs = append(segs, segment{isWild: true})
				rest = rest[end+1:]
				expectKey = false
				continue
			}
			idx, err := strconv.Atoi(rest[1:end])
			if err != nil || idx < 0 {
				return nil, fmt.Errorf("binding: invalid array index %q in path %q", rest[1:end], path)
			}
			segs = append(segs, segment{index: idx, isIndex: true})
			rest = rest[end+1:]
			expectKey = false
		default:
			end := strings.IndexAny(rest, ".[")
			if end < 0 {
				end = len(rest)
			}
			if !expectKey {
				return nil, fmt.Errorf("binding: expected '.' or '[' before %q in path %q", rest, path)
			}
			segs = append(segs, segment{key: rest[:end]})
			rest = rest[end:]
			expectKey = false
		}
	}
	if expectKey {
		return nil, fmt.Errorf("binding: trailing '.' in path %q", path)
	}
	return segs, nil
}

// splitFirst returns the leading dot-delimited word of an accessor path and
// the remainder. Brackets end the word too, with the remainder keeping them:
// "items[0].id" → ("items", "[0].id").
func splitFirst(path string) (first, rest string) {
	i := strings.IndexAny(path, ".[")
	if i < 0 {
		return path, ""
	}
	if path[i] == '.' {
		return path[:i], path[i+1:]
	}
	return path[:i], path[i:]
}

// resolveOutputPath resolves an accessor path against one node's captured
// output, applying the accessor precedence (explicit prefix → export → body
// path). exports must be nil when resolving an export's own path so exports
// cannot chain.
func resolveOutputPath(node string, out *Output, exports []Export, path string) (any, error) {
	p := path
	if p == prefixResponse {
		p = ""
	} else if strings.HasPrefix(p, prefixResponse+".") {
		p = p[len(prefixResponse)+1:]
	}
	if p == "" {
		return out.Body, nil
	}
	first, rest := splitFirst(p)
	switch first {
	case prefixStatus:
		if rest != "" {
			return nil, &PathNotFoundError{Node: node, Path: path, Hint: "status is a number and has no sub-fields"}
		}
		return out.Status, nil
	case prefixHeaders, prefixHeader:
		return resolveHeader(node, out, path, rest)
	case prefixBody:
		return resolveBodyPath(node, out.Body, path, rest)
	default:
		for _, ex := range exports {
			if ex.Key != first {
				continue
			}
			base, err := resolveOutputPath(node, out, nil, ex.Path)
			if err != nil {
				return nil, err
			}
			return resolveValuePath(node, base, path, rest)
		}
		// No explicit prefix and no export matched: the whole path is a
		// body path ("name" ≡ "body.name").
		return resolveBodyPath(node, out.Body, path, p)
	}
}

func resolveHeader(node string, out *Output, fullPath, name string) (any, error) {
	if name == "" {
		flat := make(map[string]any, len(out.Header))
		for k := range out.Header {
			flat[k] = out.Header.Get(k)
		}
		return flat, nil
	}
	if v := out.Header.Get(name); v != "" {
		return v, nil
	}
	// Distinguish "present but empty" from "absent".
	if _, ok := out.Header[textproto.CanonicalMIMEHeaderKey(name)]; ok {
		return "", nil
	}
	names := make([]string, 0, len(out.Header))
	for k := range out.Header {
		names = append(names, k)
	}
	return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: hintFromKeys("headers are", names)}
}

func resolveBodyPath(node string, body any, fullPath, rest string) (any, error) {
	segs, err := parsePath(rest)
	if err != nil {
		return nil, err
	}
	return resolveSegments(node, body, fullPath, segs)
}

func resolveValuePath(node string, value any, fullPath, rest string) (any, error) {
	segs, err := parsePath(rest)
	if err != nil {
		return nil, err
	}
	return resolveSegments(node, value, fullPath, segs)
}

func resolveSegments(node string, value any, fullPath string, segs []segment) (any, error) {
	current := value
	for i, seg := range segs {
		if seg.isWild {
			arr, ok := current.([]any)
			if !ok {
				return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: fmt.Sprintf("[*] needs an array, but the value is a JSON %s", jsonTypeName(current))}
			}
			// Map the rest of the path over every element; nested [*]
			// recurses, so "a[*].b[*].c" yields nested arrays.
			mapped := make([]any, len(arr))
			for j, elem := range arr {
				v, err := resolveSegments(node, elem, fullPath, segs[i+1:])
				if err != nil {
					return nil, err
				}
				mapped[j] = v
			}
			return mapped, nil
		}
		switch v := current.(type) {
		case map[string]any:
			if seg.isIndex {
				return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: hintFromKeys("value is an object with keys", mapKeys(v))}
			}
			next, ok := v[seg.key]
			if !ok {
				return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: hintFromKeys("available keys are", mapKeys(v))}
			}
			current = next
		case []any:
			if !seg.isIndex {
				return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: fmt.Sprintf("value is an array of %d elements; use [index]", len(v))}
			}
			if seg.index >= len(v) {
				return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: fmt.Sprintf("index %d out of range for array of %d elements", seg.index, len(v))}
			}
			current = v[seg.index]
		default:
			return nil, &PathNotFoundError{Node: node, Path: fullPath, Hint: fmt.Sprintf("value is a JSON %s and has no sub-fields", jsonTypeName(current))}
		}
	}
	return current, nil
}

func mapKeys(m map[string]any) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func hintFromKeys(label string, keys []string) string {
	if len(keys) == 0 {
		return label + " (none)"
	}
	sort.Strings(keys)
	if len(keys) > hintKeyCap {
		keys = append(keys[:hintKeyCap:hintKeyCap], "…")
	}
	return label + " " + strings.Join(keys, ", ")
}

func jsonTypeName(v any) string {
	switch v.(type) {
	case nil:
		return "null"
	case bool:
		return "boolean"
	case string:
		return "string"
	case float64, int, int64:
		return "number"
	case map[string]any:
		return "object"
	case []any:
		return "array"
	}
	return fmt.Sprintf("%T", v)
}
