// Package httpcall executes one fully-resolved HTTP request (plan 08 C2/C9).
// It is the request build path the M1 executor will share: origin precedence,
// URL join normalization, path-parameter substitution, JSON/raw bodies,
// method rules, credential injection with redaction, and capped response
// capture. Like the rest of core it is UI-free: callers hand it literal
// values only — no bindings, no store types.
package httpcall

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ProtocolHTTP is the only wire protocol that executes; anything else (the
// plan 08 C10 'ws' stub) is rejected before touching the network.
const ProtocolHTTP = "http"

// MaxCaptureBytes caps how much of a response body is kept (plan 05's cap).
const MaxCaptureBytes = 256 << 10

// DefaultTimeout bounds a call when the caller supplies no client.
const DefaultTimeout = 30 * time.Second

// RedactedValue replaces credential-injected header values in any material
// that leaves this package (plan 08 B4: secrets never appear in logs/UI).
const RedactedValue = "•••"

// methods is the full supported set (plan 08 A1).
var methods = map[string]bool{
	http.MethodGet: true, http.MethodPost: true, http.MethodPut: true, http.MethodPatch: true,
	http.MethodDelete: true, http.MethodHead: true, http.MethodOptions: true,
}

// bodylessMethods never carry a request body; DELETE/OPTIONS deliberately may
// (real APIs require DELETE bodies — Elasticsearch bulk deletes, batch APIs).
var bodylessMethods = map[string]bool{http.MethodGet: true, http.MethodHead: true}

// RawBody is a verbatim request body (plan 08 A1's escape hatch).
type RawBody struct {
	ContentType string `json:"contentType"`
	Text        string `json:"text"`
}

// Request is one fully-resolved call. Origin (from an absolute request URL)
// takes precedence over EnvBase, the picked environment's base URL.
type Request struct {
	Protocol   string
	Method     string
	Origin     string
	EnvBase    string
	Path       string // may contain {placeholders}, substituted from PathParams
	PathParams map[string]string
	Query      map[string]string
	Headers    map[string]string
	Body       any // JSON-marshaled when set; mutually exclusive with RawBody
	RawBody    *RawBody
}

// Response is the captured outcome of a call.
type Response struct {
	Status      int
	Headers     map[string]string
	Body        any // parsed when the captured text is valid JSON
	BodyText    string
	Truncated   bool
	DurationMs  int
	URL         string            // as sent, except query-kind credential values are redacted
	SentHeaders map[string]string // as sent, credential values redacted
}

// BuildURL assembles the final URL: effective base (origin over envBase, must
// be absolute http(s)), path with placeholders substituted, exactly one slash
// at the seam, query appended.
func BuildURL(req Request) (string, error) {
	base := req.Origin
	if base == "" {
		base = req.EnvBase
	}
	parsed, err := url.Parse(strings.TrimSpace(base))
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", fmt.Errorf("base URL %q is not an absolute http(s) URL", base)
	}

	path := req.Path
	for _, name := range placeholders(path) {
		value, ok := req.PathParams[name]
		if !ok || strings.TrimSpace(value) == "" {
			return "", fmt.Errorf("path parameter {%s} has no value", name)
		}
		path = strings.ReplaceAll(path, "{"+name+"}", url.PathEscape(value))
	}

	full := strings.TrimRight(parsed.String(), "/")
	if path != "" && !strings.HasPrefix(path, "/") && !strings.HasPrefix(path, "?") {
		path = "/" + path
	}
	full += path

	if len(req.Query) > 0 {
		values := url.Values{}
		for k, v := range req.Query {
			values.Set(k, v)
		}
		sep := "?"
		if strings.Contains(full, "?") {
			sep = "&"
		}
		full += sep + values.Encode()
	}
	return full, nil
}

// Do executes the request. A nil client gets the default timeout; cred, when
// non-nil, is injected per its kind and redacted in SentHeaders (header
// kinds) or in the reported URL (query kind).
func Do(ctx context.Context, client *http.Client, req Request, cred *Credential) (Response, error) {
	if req.Protocol != "" && req.Protocol != ProtocolHTTP {
		return Response{}, fmt.Errorf("protocol %q is not executable yet — only http requests run", req.Protocol)
	}
	if !methods[req.Method] {
		return Response{}, fmt.Errorf("unsupported HTTP method %q", req.Method)
	}
	if bodylessMethods[req.Method] && (req.Body != nil || req.RawBody != nil) {
		return Response{}, fmt.Errorf("%s requests cannot carry a body", req.Method)
	}
	if req.Body != nil && req.RawBody != nil {
		return Response{}, fmt.Errorf("request has both a field body and a raw body")
	}

	var inj *injection
	if cred != nil {
		resolved, err := cred.resolve()
		if err != nil {
			return Response{}, err
		}
		inj = &resolved
	}

	fullURL, err := BuildURL(req)
	if err != nil {
		return Response{}, err
	}
	// Query-kind credentials append after BuildURL so they can't collide with
	// literal query rows; the reported URL carries the redaction marker
	// instead of the secret, because URLs land in logs.
	displayURL := fullURL
	if inj != nil && inj.param != "" {
		sep := "?"
		if strings.Contains(fullURL, "?") {
			sep = "&"
		}
		name := url.QueryEscape(inj.param)
		displayURL = fullURL + sep + name + "=" + RedactedValue
		fullURL += sep + name + "=" + url.QueryEscape(inj.value)
	}

	var body io.Reader
	contentType := ""
	switch {
	case req.RawBody != nil:
		body = strings.NewReader(req.RawBody.Text)
		contentType = req.RawBody.ContentType
	case req.Body != nil:
		raw, err := json.Marshal(req.Body)
		if err != nil {
			return Response{}, fmt.Errorf("marshal request body: %w", err)
		}
		body = bytes.NewReader(raw)
		contentType = "application/json"
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.Method, fullURL, body)
	if err != nil {
		return Response{}, err
	}
	if contentType != "" {
		httpReq.Header.Set("Content-Type", contentType)
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}
	// The credential lands last so a stray literal header can't override it.
	if inj != nil && inj.header != "" {
		httpReq.Header.Set(inj.header, inj.value)
	}

	if client == nil {
		client = &http.Client{Timeout: DefaultTimeout}
	}
	started := time.Now()
	resp, err := client.Do(httpReq)
	if err != nil {
		return Response{}, err
	}
	defer resp.Body.Close()

	captured, err := io.ReadAll(io.LimitReader(resp.Body, MaxCaptureBytes+1))
	if err != nil {
		return Response{}, fmt.Errorf("read response body: %w", err)
	}
	out := Response{
		Status:      resp.StatusCode,
		Headers:     flattenHeader(resp.Header),
		DurationMs:  int(time.Since(started).Milliseconds()),
		URL:         displayURL,
		SentHeaders: redactedHeaders(httpReq.Header, inj),
	}
	if len(captured) > MaxCaptureBytes {
		out.Truncated = true
		captured = captured[:MaxCaptureBytes]
	}
	out.BodyText = string(captured)
	if !out.Truncated && len(captured) > 0 {
		var parsed any
		if json.Unmarshal(captured, &parsed) == nil {
			out.Body = parsed
		}
	}
	return out, nil
}

// placeholders lists {name} occurrences in order, deduplicated.
func placeholders(path string) []string {
	var names []string
	seen := map[string]bool{}
	rest := path
	for {
		open := strings.Index(rest, "{")
		if open < 0 {
			return names
		}
		close := strings.Index(rest[open:], "}")
		if close < 0 {
			return names
		}
		name := strings.TrimSpace(rest[open+1 : open+close])
		if name != "" && !seen[name] {
			seen[name] = true
			names = append(names, name)
		}
		rest = rest[open+close+1:]
	}
}

func flattenHeader(h http.Header) map[string]string {
	out := make(map[string]string, len(h))
	for name := range h {
		out[name] = h.Get(name)
	}
	return out
}

func redactedHeaders(h http.Header, inj *injection) map[string]string {
	out := flattenHeader(h)
	if inj != nil && inj.header != "" {
		out[http.CanonicalHeaderKey(inj.header)] = RedactedValue
	}
	return out
}
