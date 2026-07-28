package nodespec

import (
	"errors"
	"fmt"
	"net/url"
	"strings"

	"cascade/core/binding"
	"cascade/core/httpcall"
	"cascade/core/transform"
)

// BaseURLFunc maps an environment name to its base URL. Declared here rather
// than in exec because BuildRequest is the only caller and nodespec must not
// depend on the runtime; exec.EnvBaseFunc is an alias of this type.
type BaseURLFunc func(name string) (string, error)

// Target-resolution failures name both ways out, because neither is obvious
// from httpcall's `base URL "" is not an absolute http(s) URL`.
const (
	noTargetMessage    = "node has no target — pick an environment or set an origin override"
	unknownEnvFormat   = "node targets environment %q, which has no base URL — pick an environment or set an origin override"
	missingParamFormat = "path parameter %q needs a value — fill it in the Params section"
)

const (
	schemeSeparator = "://"
	schemeHTTP      = "http"
	schemeHTTPS     = "https"
)

// BuildRequest resolves the node's fields against env and assembles the
// fully-resolved call. baseURL is called ONLY if neither the path's own origin
// nor s.Origin supplies a base, so a node that overrides its origin never
// fails on an absent or unknown environment — which is exactly the shape
// nodeFactory gives a hand-made custom node (environment: ”).
func (s HTTPSpec) BuildRequest(env *binding.Env, baseURL BaseURLFunc) (httpcall.Request, error) {
	req := httpcall.Request{
		Protocol: s.Protocol,
		Method:   s.Method,
		Path:     strings.TrimSpace(s.Path),
	}
	// An absolute URL typed into the path carries its own origin and wins over
	// both the node override and the environment. The path input has no
	// validation, and splitUrl runs only at node construction on the frontend,
	// so without this a pasted URL becomes <envBase>/https://api.other.io/…
	if origin, rest, ok := splitURL(req.Path); ok {
		req.Origin, req.Path = origin, rest
	} else if origin := strings.TrimSpace(s.Origin); origin != "" {
		req.Origin = origin
	} else {
		base, err := s.envBase(baseURL)
		if err != nil {
			return httpcall.Request{}, err
		}
		req.EnvBase = base
	}

	// GET/HEAD never carry a body, and raw mode replaces the field body
	// outright rather than merging with it (the mode switch is `rawBody !==
	// undefined`, so in raw mode no body rows are even visible). Knowing this
	// up front means a body row that cannot be sent is not resolved either: a
	// binding error in a field the editor is not showing would otherwise fail
	// a request that never carried it.
	allowsBody := httpcall.MethodAllowsBody(req.Method)
	dropFieldBody := !allowsBody || s.RawBody != nil

	body := map[string]any{}
	hasBody := false
	for _, f := range s.Fields {
		section, name, err := f.Section()
		if err != nil {
			return httpcall.Request{}, err
		}
		if section == SectionBody {
			if dropFieldBody {
				continue
			}
			value, err := f.resolve(env)
			if err != nil {
				return httpcall.Request{}, err
			}
			// Nested keys ("body.user.name") nest through the same writer pick
			// rows use, so both sides agree on last-wins for conflicting paths.
			transform.SetKeyPath(body, name, value)
			hasBody = true
			continue
		}
		value, err := f.resolve(env)
		if err != nil {
			return httpcall.Request{}, err
		}
		// These three sections are wire bytes, so D16's format governs, not
		// fmt.Sprint (which renders a map as map[…] where template
		// interpolation renders JSON, for the same value in the same request).
		text, err := binding.Stringify(value)
		if err != nil {
			return httpcall.Request{}, fmt.Errorf("field %q: %w", f.Key, err)
		}
		switch section {
		case SectionPath:
			setString(&req.PathParams, name, text)
		case SectionQuery:
			setString(&req.Query, name, text)
		case SectionHeader:
			setString(&req.Headers, name, text)
		}
	}

	// paramRows derives path rows from the current placeholders and persists
	// nothing until the user types, so a required {id} is legitimately absent
	// from fields. Say that, rather than httpcall's `{id} has no value`.
	for _, name := range httpcall.Placeholders(req.Path) {
		if strings.TrimSpace(req.PathParams[name]) == "" {
			return httpcall.Request{}, fmt.Errorf(missingParamFormat, name)
		}
	}

	if !allowsBody {
		return req, nil
	}
	if s.RawBody == nil {
		if hasBody {
			req.Body = body
		}
		return req, nil
	}
	rawBody, err := s.resolveRawBody(env)
	if err != nil {
		return httpcall.Request{}, err
	}
	req.RawBody = rawBody
	return req, nil
}

// resolveRawBody renders the raw body as one template. It has to resolve as a
// whole rather than per-field: `{{createUser.body}}` alone resolves to a map,
// while RawBody.Text is a string, so the resolved value goes through Stringify
// on its way to the wire.
//
// A blank raw body means no body at all — not an empty document under
// Content-Type: application/json. This is deliberately stricter than
// buildTestRequest, which sends an empty rawBody as-is: a RequestDef only has
// one because the user switched the editor into raw mode, while
// makeCustomHttpNode seeds one on every hand-made node whether or not raw mode
// was ever chosen.
func (s HTTPSpec) resolveRawBody(env *binding.Env) (*httpcall.RawBody, error) {
	if strings.TrimSpace(s.RawBody.Text) == "" {
		return nil, nil
	}
	value, err := binding.Template(s.RawBody.Text).Resolve(env)
	if err != nil {
		return nil, fmt.Errorf("raw body: %w", err)
	}
	text, err := binding.Stringify(value)
	if err != nil {
		return nil, fmt.Errorf("raw body: %w", err)
	}
	return &httpcall.RawBody{ContentType: s.RawBody.ContentType, Text: text}, nil
}

// envBase resolves the node's environment to a base URL. A resolver error and
// a blank base collapse into one message: both mean the node names an
// environment it cannot be sent against, and the fix is the same either way.
func (s HTTPSpec) envBase(baseURL BaseURLFunc) (string, error) {
	name := strings.TrimSpace(s.Environment)
	if name == "" {
		return "", errors.New(noTargetMessage)
	}
	if baseURL == nil {
		return "", fmt.Errorf(unknownEnvFormat, name)
	}
	base, err := baseURL(name)
	if err != nil || strings.TrimSpace(base) == "" {
		return "", fmt.Errorf(unknownEnvFormat, name)
	}
	return base, nil
}

// splitURL splits an absolute http(s) URL into its origin and the path+query
// that follows. The Go twin of request.ts splitUrl.
func splitURL(value string) (origin, path string, ok bool) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return "", "", false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != schemeHTTP && scheme != schemeHTTPS {
		return "", "", false
	}
	// The path is cut from the input rather than read off url.URL, whose
	// EscapedPath re-encodes {id} as %7Bid%7D — httpcall substitutes
	// placeholders by their literal text.
	rest := value[strings.Index(value, schemeSeparator)+len(schemeSeparator):]
	if i := strings.IndexAny(rest, "/?#"); i >= 0 {
		path = rest[i:]
	}
	if hash := strings.IndexByte(path, '#'); hash >= 0 {
		path = path[:hash]
	}
	if path == "/" {
		path = ""
	}
	return scheme + schemeSeparator + parsed.Host, path, true
}

// setString writes into a lazily allocated map, so a request with no headers
// carries a nil Headers rather than an empty one.
func setString(m *map[string]string, key, value string) {
	if *m == nil {
		*m = make(map[string]string)
	}
	(*m)[key] = value
}
