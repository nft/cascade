package httpcall

import (
	"context"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBuildURL(t *testing.T) {
	tests := []struct {
		name string
		req  Request
		want string
	}{
		{"plain join", Request{EnvBase: "https://x.io", Path: "/v1/users"}, "https://x.io/v1/users"},
		{"trailing slash base", Request{EnvBase: "https://x.io/", Path: "/v1/users"}, "https://x.io/v1/users"},
		{"slashless path", Request{EnvBase: "https://x.io", Path: "v1/users"}, "https://x.io/v1/users"},
		{"empty path", Request{EnvBase: "https://x.io/", Path: ""}, "https://x.io"},
		{"origin wins over envBase", Request{Origin: "https://other.io", EnvBase: "https://x.io", Path: "/p"}, "https://other.io/p"},
		{
			"path params substituted and escaped",
			Request{EnvBase: "https://x.io", Path: "/v1/users/{id}/files/{name}", PathParams: map[string]string{"id": "u1", "name": "a b"}},
			"https://x.io/v1/users/u1/files/a%20b",
		},
		{
			"query appended sorted",
			Request{EnvBase: "https://x.io", Path: "/p", Query: map[string]string{"b": "2", "a": "1"}},
			"https://x.io/p?a=1&b=2",
		},
		{
			"query appends to a path that already has one",
			Request{EnvBase: "https://x.io", Path: "/p?fixed=1", Query: map[string]string{"a": "1"}},
			"https://x.io/p?fixed=1&a=1",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := BuildURL(tt.req)
			if err != nil {
				t.Fatalf("BuildURL: %v", err)
			}
			if got != tt.want {
				t.Errorf("BuildURL = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestBuildURLErrors(t *testing.T) {
	if _, err := BuildURL(Request{EnvBase: "not-a-url", Path: "/p"}); err == nil {
		t.Error("relative base accepted")
	}
	if _, err := BuildURL(Request{Path: "/p"}); err == nil {
		t.Error("empty base accepted")
	}
	_, err := BuildURL(Request{EnvBase: "https://x.io", Path: "/v1/users/{id}"})
	if err == nil || !strings.Contains(err.Error(), "{id}") {
		t.Errorf("missing path param: got %v, want error naming {id}", err)
	}
}

func TestDoValidation(t *testing.T) {
	ctx := context.Background()
	if _, err := Do(ctx, nil, Request{Protocol: "ws", Method: "GET", EnvBase: "https://x.io"}, nil); err == nil {
		t.Error("ws protocol accepted")
	}
	if _, err := Do(ctx, nil, Request{Method: "YEET", EnvBase: "https://x.io"}, nil); err == nil {
		t.Error("unknown method accepted")
	}
	if _, err := Do(ctx, nil, Request{Method: "GET", EnvBase: "https://x.io", Body: map[string]any{"a": 1}}, nil); err == nil {
		t.Error("GET with body accepted")
	}
	if _, err := Do(ctx, nil, Request{Method: "HEAD", EnvBase: "https://x.io", RawBody: &RawBody{Text: "x"}}, nil); err == nil {
		t.Error("HEAD with raw body accepted")
	}
}

// echo captures what the server saw for assertions.
type echo struct {
	method, path, query, contentType, body, auth string
	headers                                      http.Header
}

func newEchoServer(t *testing.T, seen *echo, status int, respBody string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		*seen = echo{
			method: r.Method, path: r.URL.Path, query: r.URL.RawQuery,
			contentType: r.Header.Get("Content-Type"), body: string(raw),
			auth: r.Header.Get("Authorization"), headers: r.Header.Clone(),
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(respBody))
	}))
}

func TestDoJSONBody(t *testing.T) {
	var seen echo
	srv := newEchoServer(t, &seen, http.StatusCreated, `{"id":"inv_1","ok":true}`)
	defer srv.Close()

	resp, err := Do(context.Background(), srv.Client(), Request{
		Method:  "POST",
		EnvBase: srv.URL,
		Path:    "/v1/invoices",
		Query:   map[string]string{"dry": "1"},
		Headers: map[string]string{"X-Debug": "on"},
		Body:    map[string]any{"amount": "100"},
	}, nil)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if seen.method != "POST" || seen.path != "/v1/invoices" || seen.query != "dry=1" {
		t.Errorf("server saw %+v", seen)
	}
	if seen.contentType != "application/json" || seen.body != `{"amount":"100"}` {
		t.Errorf("body: content-type %q, body %q", seen.contentType, seen.body)
	}
	if resp.Status != http.StatusCreated {
		t.Errorf("status = %d", resp.Status)
	}
	parsed, ok := resp.Body.(map[string]any)
	if !ok || parsed["id"] != "inv_1" {
		t.Errorf("parsed body = %#v", resp.Body)
	}
	if resp.SentHeaders["X-Debug"] != "on" {
		t.Errorf("sent headers = %v", resp.SentHeaders)
	}
}

func TestDoRawBody(t *testing.T) {
	var seen echo
	srv := newEchoServer(t, &seen, http.StatusOK, `plain text`)
	defer srv.Close()

	resp, err := Do(context.Background(), srv.Client(), Request{
		Method:  "PUT",
		EnvBase: srv.URL,
		Path:    "/blob",
		RawBody: &RawBody{ContentType: "text/csv", Text: "a,b\n1,2"},
	}, nil)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if seen.contentType != "text/csv" || seen.body != "a,b\n1,2" {
		t.Errorf("raw body: content-type %q, body %q", seen.contentType, seen.body)
	}
	if resp.Body != nil || resp.BodyText != "plain text" {
		t.Errorf("non-JSON response: body %#v, text %q", resp.Body, resp.BodyText)
	}
}

func TestDoCredentialInjectionAndRedaction(t *testing.T) {
	var seen echo
	srv := newEchoServer(t, &seen, http.StatusOK, `{}`)
	defer srv.Close()

	resp, err := Do(context.Background(), srv.Client(), Request{
		Method: "GET", EnvBase: srv.URL, Path: "/me",
		// A stray literal Authorization row must lose to the injected credential.
		Headers: map[string]string{"Authorization": "Bearer stale"},
	}, &Credential{Kind: KindBearer, Secret: "s3cret"})
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if seen.auth != "Bearer s3cret" {
		t.Errorf("server saw Authorization %q", seen.auth)
	}
	if resp.SentHeaders["Authorization"] != RedactedValue {
		t.Errorf("SentHeaders leaks the credential: %v", resp.SentHeaders)
	}
	for _, v := range resp.SentHeaders {
		if strings.Contains(v, "s3cret") {
			t.Errorf("credential value leaked in sent headers: %v", resp.SentHeaders)
		}
	}
}

func TestDoCapsResponseCapture(t *testing.T) {
	big := strings.Repeat("x", MaxCaptureBytes+100)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(big))
	}))
	defer srv.Close()

	resp, err := Do(context.Background(), srv.Client(), Request{Method: "GET", EnvBase: srv.URL, Path: "/big"}, nil)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if !resp.Truncated {
		t.Error("oversized body not marked truncated")
	}
	if len(resp.BodyText) != MaxCaptureBytes {
		t.Errorf("captured %d bytes, want cap %d", len(resp.BodyText), MaxCaptureBytes)
	}
	if resp.Body != nil {
		t.Error("truncated body must not parse as JSON")
	}
}

func TestDoHead(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Count", "42")
	}))
	defer srv.Close()

	resp, err := Do(context.Background(), srv.Client(), Request{Method: "HEAD", EnvBase: srv.URL, Path: "/"}, nil)
	if err != nil {
		t.Fatalf("Do: %v", err)
	}
	if resp.Status != http.StatusOK || resp.Headers["X-Count"] != "42" || resp.BodyText != "" {
		t.Errorf("HEAD response = %+v", resp)
	}
}

// closedPort binds and immediately releases an address, so a dial to it is
// guaranteed to be refused rather than to reach some unrelated service.
func closedPort(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	addr := ln.Addr().String()
	if err := ln.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}
	return addr
}

// TestDoTransportFailureRedactsAndReportsAttempt covers both failure-path
// defects at once: a *url.Error stringifies the URL it was given, so the raw
// query-kind secret would otherwise land in a copyable log row; and what the
// call is known to have attempted must survive alongside the error.
func TestDoTransportFailureRedactsAndReportsAttempt(t *testing.T) {
	const secret = "s3cret-query-value"
	const requestID = "req-1"

	resp, err := Do(context.Background(), nil, Request{
		Method:  http.MethodGet,
		EnvBase: "http://" + closedPort(t),
		Path:    "/v1/users",
		Headers: map[string]string{"X-Request-Id": requestID},
	}, &Credential{Kind: KindQuery, Param: "api_key", Secret: secret})
	if err == nil {
		t.Fatal("a dial to a closed port returned no error")
	}
	if strings.Contains(err.Error(), secret) {
		t.Errorf("credential value leaked into the error: %v", err)
	}
	if !strings.Contains(err.Error(), RedactedValue) {
		t.Errorf("error does not name the redacted URL: %v", err)
	}

	if !strings.Contains(resp.URL, RedactedValue) || strings.Contains(resp.URL, secret) {
		t.Errorf("reported URL = %q", resp.URL)
	}
	if resp.SentHeaders["X-Request-Id"] != requestID {
		t.Errorf("SentHeaders = %v, want the headers as sent", resp.SentHeaders)
	}
	if resp.Status != 0 {
		t.Errorf("Status = %d, want 0 when nothing was received", resp.Status)
	}
}

// TestDoTransportFailureReportsElapsed pins the elapsed time on the failure
// path. A refused connection to loopback completes in far under a
// millisecond, so a client timeout is the only transport failure whose
// duration is large enough to observe at DurationMs' resolution.
func TestDoTransportFailureReportsElapsed(t *testing.T) {
	const clientTimeout = 30 * time.Millisecond
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, _ *http.Request) {
		<-release
	}))
	// The handler must be released before Close, which waits for it.
	defer srv.Close()
	defer close(release)

	client := srv.Client()
	client.Timeout = clientTimeout
	resp, err := Do(context.Background(), client, Request{
		Method: http.MethodGet, EnvBase: srv.URL, Path: "/slow",
	}, nil)
	if err == nil {
		t.Fatal("a timed-out request returned no error")
	}
	if resp.DurationMs <= 0 {
		t.Errorf("DurationMs = %d, want the elapsed time of the failed attempt", resp.DurationMs)
	}
	if resp.URL == "" {
		t.Error("the attempted URL was discarded")
	}
}
