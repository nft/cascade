package nodespec

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"cascade/core/binding"
	"cascade/core/httpcall"
)

const testEnvName = "staging"
const testEnvBase = "https://staging.api.example.com"

func testEnv() *binding.Env {
	return &binding.Env{
		Outputs: map[string]*binding.Output{
			"create-org": {Status: 201, Body: map[string]any{"id": "org-1", "seats": float64(12)}},
			// Deliberately unsorted, with an HTML rune and a number both Go
			// verbs render differently from JS.
			"payload": {Status: 200, Body: map[string]any{"z": true, "a": "<b>&", "n": 1e21}},
		},
		Upstreams: []string{"create-org"},
		Index:     2,
	}
}

func staticBase(name string) (string, error) {
	if name != testEnvName {
		return "", errors.New("unknown environment")
	}
	return testEnvBase, nil
}

// failingBase fails the test if it is consulted: the environment lookup is
// lazy, so a node that carries its own origin must never reach it. It both
// reports and errors — a caller that discards the error would otherwise leave
// the resolved base unused and the leak invisible.
func failingBase(t *testing.T) BaseURLFunc {
	t.Helper()
	return func(name string) (string, error) {
		t.Errorf("environment %q resolved for a node that carries its own origin", name)
		return "", errors.New("must not be called")
	}
}

func TestBuildRequest(t *testing.T) {
	cases := []struct {
		name string
		spec HTTPSpec
		base BaseURLFunc
		// ownOrigin asserts the node resolves its target without the
		// environment: the resolver must not be consulted at all.
		ownOrigin bool
		want      httpcall.Request
	}{{
		name: "body keys nest through their dot path",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/v1/users", Environment: testEnvName,
			Fields: []Field{
				{Key: "body.user.name", Source: FieldLiteral, Value: "Ada"},
				{Key: "body.user.orgId", Source: FieldBinding, Ref: &Ref{NodeID: "create-org", Path: "body.id"}},
				{Key: "body.tier", Source: FieldLiteral, Value: "pro"},
			},
		},
		want: httpcall.Request{
			Method: http.MethodPost, Path: "/v1/users", EnvBase: testEnvBase,
			Body: map[string]any{
				"user": map[string]any{"name": "Ada", "orgId": "org-1"},
				"tier": "pro",
			},
		},
	}, {
		// Sorted keys, no HTML escaping, ECMA-262 number rendering — these are
		// wire bytes, so the D16 format governs rather than json.Marshal's
		// defaults.
		name: "a header bound to an object is stringified as JSON",
		spec: HTTPSpec{
			Method: http.MethodGet, Path: "/v1/echo", Environment: testEnvName,
			Fields: []Field{
				{Key: "header.X-Payload", Source: FieldBinding, Ref: &Ref{NodeID: "payload"}},
				{Key: "query.seats", Source: FieldBinding, Ref: &Ref{NodeID: "create-org", Path: "body.seats"}},
			},
		},
		want: httpcall.Request{
			Method: http.MethodGet, Path: "/v1/echo", EnvBase: testEnvBase,
			Headers: map[string]string{"X-Payload": `{"a":"<b>&","n":1e+21,"z":true}`},
			Query:   map[string]string{"seats": "12"},
		},
	}, {
		// makeCustomHttpNode seeds every hand-made node with method GET *and*
		// an empty raw body, which httpcall.Do hard-fails as a pair. Without
		// this rule the most common node a user creates by hand never reaches
		// the wire.
		name: "the default hand-made node builds a bodyless GET",
		spec: HTTPSpec{
			Method: http.MethodGet, Path: "/health", Origin: "http://localhost:8080",
			RawBody: &httpcall.RawBody{ContentType: "application/json", Text: ""},
		},
		ownOrigin: true,
		want:      httpcall.Request{Method: http.MethodGet, Path: "/health", Origin: "http://localhost:8080"},
	}, {
		name: "an unfilled raw body sends no body at all",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/v1/users", Environment: testEnvName,
			RawBody: &httpcall.RawBody{ContentType: "application/json", Text: "  \n "},
		},
		want: httpcall.Request{Method: http.MethodPost, Path: "/v1/users", EnvBase: testEnvBase},
	}, {
		// The whole text is one template, so a lone {{ref}} resolves to a map
		// and Stringify renders it — RawBody.Text is a string.
		name: "a raw body that is one whole-object binding",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/hooks", Environment: testEnvName,
			RawBody: &httpcall.RawBody{ContentType: "application/json", Text: "{{payload}}"},
		},
		want: httpcall.Request{
			Method: http.MethodPost, Path: "/hooks", EnvBase: testEnvBase,
			RawBody: &httpcall.RawBody{ContentType: "application/json", Text: `{"a":"<b>&","n":1e+21,"z":true}`},
		},
	}, {
		name: "a raw body interpolates into surrounding text",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/hooks", Environment: testEnvName,
			RawBody: &httpcall.RawBody{
				ContentType: "application/json",
				Text:        `{"org":"{{create-org.body.id}}","run":{{i}}}`,
			},
		},
		want: httpcall.Request{
			Method: http.MethodPost, Path: "/hooks", EnvBase: testEnvBase,
			RawBody: &httpcall.RawBody{ContentType: "application/json", Text: `{"org":"org-1","run":2}`},
		},
	}, {
		// The path input has no validation and splitUrl runs only at node
		// construction, so a URL pasted into an existing node arrives here
		// intact — and would otherwise become <origin>/https://api.other.io/…
		name: "an absolute URL in the path beats the origin override",
		spec: HTTPSpec{
			Method: http.MethodGet, Path: "https://api.other.io/v1/things/{id}?page=2",
			Origin: "http://localhost:8080", Environment: testEnvName,
			Fields: []Field{{Key: "path.id", Source: FieldLiteral, Value: "t-9"}},
		},
		ownOrigin: true,
		want: httpcall.Request{
			Method: http.MethodGet, Origin: "https://api.other.io", Path: "/v1/things/{id}?page=2",
			PathParams: map[string]string{"id": "t-9"},
		},
	}, {
		name: "the origin override beats the environment",
		spec: HTTPSpec{
			Method: http.MethodGet, Path: "/v1/things", Origin: "http://localhost:8080",
			Environment: testEnvName,
		},
		ownOrigin: true,
		want:      httpcall.Request{Method: http.MethodGet, Path: "/v1/things", Origin: "http://localhost:8080"},
	}, {
		// A body row is invisible in raw mode, so a binding error inside one
		// must not fail a request that would never have carried it.
		name: "raw mode drops body fields without resolving them",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/hooks", Environment: testEnvName,
			Fields: []Field{
				{Key: "body.ghost", Source: FieldBinding, Ref: &Ref{NodeID: "never-ran", Path: "body.id"}},
				{Key: "query.keep", Source: FieldLiteral, Value: "1"},
			},
			RawBody: &httpcall.RawBody{ContentType: "text/plain", Text: "ping"},
		},
		want: httpcall.Request{
			Method: http.MethodPost, Path: "/hooks", EnvBase: testEnvBase,
			Query:   map[string]string{"keep": "1"},
			RawBody: &httpcall.RawBody{ContentType: "text/plain", Text: "ping"},
		},
	}, {
		name: "a bodyless method drops field bodies too",
		spec: HTTPSpec{
			Method: http.MethodGet, Path: "/v1/users", Environment: testEnvName,
			Fields: []Field{
				{Key: "body.ghost", Source: FieldBinding, Ref: &Ref{NodeID: "never-ran", Path: "body.id"}},
				{Key: "header.Accept", Source: FieldLiteral, Value: "application/json"},
			},
		},
		want: httpcall.Request{
			Method: http.MethodGet, Path: "/v1/users", EnvBase: testEnvBase,
			Headers: map[string]string{"Accept": "application/json"},
		},
	}, {
		name:      "an absolute URL with no path leaves the path empty",
		spec:      HTTPSpec{Method: http.MethodGet, Path: "https://api.other.io/"},
		ownOrigin: true,
		want:      httpcall.Request{Method: http.MethodGet, Origin: "https://api.other.io"},
	}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			base := tc.base
			switch {
			case tc.ownOrigin:
				base = failingBase(t)
			case base == nil:
				base = staticBase
			}
			got, err := tc.spec.BuildRequest(testEnv(), base)
			if err != nil {
				t.Fatalf("BuildRequest: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("\n got %+v\nwant %+v", got, tc.want)
			}
		})
	}
}

func TestBuildRequestErrors(t *testing.T) {
	cases := []struct {
		name string
		spec HTTPSpec
		base BaseURLFunc
		want string
	}{{
		name: "an unprefixed field key",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/v1/users", Environment: testEnvName,
			Fields: []Field{{Key: "amount", Source: FieldLiteral, Value: "100"}},
		},
		want: `field "amount" has no section prefix`,
	}, {
		// paramRows derives path rows from the current placeholders and
		// persists nothing until the user types, so an unfilled {id} is
		// legitimately absent from fields rather than present-and-empty.
		name: "a path placeholder with no field",
		spec: HTTPSpec{Method: http.MethodGet, Path: "/v1/users/{id}", Environment: testEnvName},
		want: `path parameter "id" needs a value`,
	}, {
		name: "a path placeholder whose field is blank",
		spec: HTTPSpec{
			Method: http.MethodGet, Path: "/v1/users/{id}", Environment: testEnvName,
			Fields: []Field{{Key: "path.id", Source: FieldLiteral, Value: "   "}},
		},
		want: `path parameter "id" needs a value`,
	}, {
		name: "an environment the workspace does not have",
		spec: HTTPSpec{Method: http.MethodGet, Path: "/v1/users", Environment: "prod"},
		want: `node targets environment "prod", which has no base URL`,
	}, {
		name: "an environment with a blank base URL",
		spec: HTTPSpec{Method: http.MethodGet, Path: "/v1/users", Environment: "blank"},
		base: func(string) (string, error) { return "  ", nil },
		want: `node targets environment "blank", which has no base URL`,
	}, {
		name: "no environment and no origin",
		spec: HTTPSpec{Method: http.MethodGet, Path: "/v1/users"},
		want: "node has no target",
	}, {
		// What a selection export leaves behind: the empty literal must not
		// go out on the wire as if the user had typed it.
		name: "a field whose binding an export cut",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/v1/users", Environment: testEnvName,
			Fields: []Field{{
				Key: "body.orgId", Source: FieldLiteral, Value: "",
				Dangling: &Dangling{OriginalKey: "createOrg", Path: "body.items[0].id"},
			}},
		},
		want: `field "body.orgId": lost its binding to createOrg.body.items[0].id — re-bind it`,
	}, {
		name: "a field bound to a node that has not run",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/v1/users", Environment: testEnvName,
			Fields: []Field{{Key: "body.id", Source: FieldBinding, Ref: &Ref{NodeID: "never-ran", Path: "body.id"}}},
		},
		want: `field "body.id":`,
	}, {
		name: "a raw body bound to a node that has not run",
		spec: HTTPSpec{
			Method: http.MethodPost, Path: "/v1/users", Environment: testEnvName,
			RawBody: &httpcall.RawBody{ContentType: "application/json", Text: "{{never-ran.body}}"},
		},
		want: "raw body:",
	}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			base := tc.base
			if base == nil {
				base = staticBase
			}
			_, err := tc.spec.BuildRequest(testEnv(), base)
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("err = %v, want one containing %q", err, tc.want)
			}
			// Neither target failure may surface as httpcall's own wording:
			// "base URL \"\" is not an absolute http(s) URL" names no fix.
			if strings.Contains(err.Error(), "is not an absolute http(s) URL") {
				t.Errorf("error leaked httpcall's phrasing: %v", err)
			}
		})
	}
}

// The whole point of building a request in Go: what BuildRequest produces has
// to survive httpcall.Do as the exact bytes the user configured.
func TestBuildRequestRoundTrip(t *testing.T) {
	var got struct {
		method      string
		url         string
		body        string
		contentType string
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		got.method, got.url, got.body = r.Method, r.URL.String(), string(raw)
		got.contentType = r.Header.Get("Content-Type")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer server.Close()

	spec := HTTPSpec{
		Method: http.MethodPost, Path: "/v1/orgs/{orgId}/users", Origin: server.URL,
		Fields: []Field{
			{Key: "path.orgId", Source: FieldBinding, Ref: &Ref{NodeID: "create-org", Path: "body.id"}},
			{Key: "query.expand", Source: FieldLiteral, Value: "profile"},
			{Key: "header.X-Run", Source: FieldTemplate, Value: "run-{{i}}"},
			{Key: "body.user.name", Source: FieldLiteral, Value: "Ada"},
			{Key: "body.seats", Source: FieldBinding, Ref: &Ref{NodeID: "create-org", Path: "body.seats"}},
		},
	}
	req, err := spec.BuildRequest(testEnv(), failingBase(t))
	if err != nil {
		t.Fatalf("BuildRequest: %v", err)
	}
	resp, err := httpcall.Do(context.Background(), server.Client(), req, nil)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if got.method != http.MethodPost {
		t.Errorf("method = %q, want POST", got.method)
	}
	if got.url != "/v1/orgs/org-1/users?expand=profile" {
		t.Errorf("url = %q", got.url)
	}
	// json.Marshal sorts map keys, so the payload is byte-stable.
	if got.body != `{"seats":12,"user":{"name":"Ada"}}` {
		t.Errorf("body = %q", got.body)
	}
	if got.contentType != "application/json" {
		t.Errorf("content-type = %q", got.contentType)
	}
	if resp.SentHeaders["X-Run"] != "run-2" {
		t.Errorf("X-Run = %q, want run-2", resp.SentHeaders["X-Run"])
	}
	if resp.Status != http.StatusOK {
		t.Errorf("status = %d", resp.Status)
	}
}

// httpcall.Do writes the raw body's content type first and then applies
// req.Headers, so an explicit header.Content-Type wins. Pinning it here means
// the ordering cannot be reversed without a failing test.
func TestBuildRequestHeaderOverridesRawContentType(t *testing.T) {
	var contentType string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contentType = r.Header.Get("Content-Type")
	}))
	defer server.Close()

	spec := HTTPSpec{
		Method: http.MethodPost, Path: "/hooks", Origin: server.URL,
		Fields:  []Field{{Key: "header.Content-Type", Source: FieldLiteral, Value: "application/vnd.api+json"}},
		RawBody: &httpcall.RawBody{ContentType: "application/json", Text: `{"a":1}`},
	}
	req, err := spec.BuildRequest(testEnv(), failingBase(t))
	if err != nil {
		t.Fatalf("BuildRequest: %v", err)
	}
	if _, err := httpcall.Do(context.Background(), server.Client(), req, nil); err != nil {
		t.Fatalf("Do: %v", err)
	}
	if contentType != "application/vnd.api+json" {
		t.Errorf("content-type = %q, want the explicit header to win", contentType)
	}
}

func TestSplitURL(t *testing.T) {
	cases := []struct {
		in     string
		origin string
		path   string
		ok     bool
	}{
		{in: "https://api.io/v1/x", origin: "https://api.io", path: "/v1/x", ok: true},
		{in: "http://localhost:8080/v1/x?a=1", origin: "http://localhost:8080", path: "/v1/x?a=1", ok: true},
		// Placeholders survive: httpcall substitutes them by literal text, so
		// re-encoding them as %7Bid%7D would break path parameters.
		{in: "https://api.io/v1/users/{id}", origin: "https://api.io", path: "/v1/users/{id}", ok: true},
		{in: "https://api.io", origin: "https://api.io", ok: true},
		{in: "https://api.io/", origin: "https://api.io", ok: true},
		{in: "HTTPS://api.io/v1", origin: "https://api.io", path: "/v1", ok: true},
		{in: "https://api.io/v1#frag", origin: "https://api.io", path: "/v1", ok: true},
		{in: "/v1/x"},
		{in: ""},
		{in: "ws://api.io/socket"},
		{in: "api.io/v1/x"},
	}
	for _, tc := range cases {
		t.Run(tc.in, func(t *testing.T) {
			origin, path, ok := splitURL(tc.in)
			if ok != tc.ok || origin != tc.origin || path != tc.path {
				t.Errorf("got (%q, %q, %v), want (%q, %q, %v)", origin, path, ok, tc.origin, tc.path, tc.ok)
			}
		})
	}
}
