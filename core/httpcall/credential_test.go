package httpcall

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

// TestDoInjectionMatrix drives every credential kind against a live server:
// each kind lands exactly where its rule says, and nothing that leaves the
// package contains the secret.
func TestDoInjectionMatrix(t *testing.T) {
	const secret = "s3cret-v4lue"
	tests := []struct {
		name       string
		cred       Credential
		wantAuth   string // Authorization header the server must see
		wantHeader map[string]string
		wantQuery  string
	}{
		{
			name:     "bearer",
			cred:     Credential{Kind: KindBearer, Secret: secret},
			wantAuth: "Bearer " + secret,
		},
		{
			name:     "basic",
			cred:     Credential{Kind: KindBasic, Username: "bob", Secret: secret},
			wantAuth: "Basic Ym9iOnMzY3JldC12NGx1ZQ==", // base64("bob:" + secret)
		},
		{
			name:       "header default template",
			cred:       Credential{Kind: KindHeader, Header: "X-Api-Key", Secret: secret},
			wantHeader: map[string]string{"X-Api-Key": secret},
		},
		{
			name:       "header with prefix template",
			cred:       Credential{Kind: KindHeader, Header: "X-Internal-Token", Template: "Token {secret}", Secret: secret},
			wantHeader: map[string]string{"X-Internal-Token": "Token " + secret},
		},
		{
			name:      "query",
			cred:      Credential{Kind: KindQuery, Param: "api_key", Secret: secret},
			wantQuery: "fixed=1&api_key=" + secret,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var seen echo
			srv := newEchoServer(t, &seen, http.StatusOK, `{}`)
			defer srv.Close()

			resp, err := Do(context.Background(), srv.Client(), Request{
				Method: "GET", EnvBase: srv.URL, Path: "/p", Query: map[string]string{"fixed": "1"},
			}, &tt.cred)
			if err != nil {
				t.Fatalf("Do: %v", err)
			}
			if tt.wantAuth != "" && seen.auth != tt.wantAuth {
				t.Errorf("server saw Authorization %q, want %q", seen.auth, tt.wantAuth)
			}
			for name, want := range tt.wantHeader {
				if got := seen.headers.Get(name); got != want {
					t.Errorf("server saw %s: %q, want %q", name, got, want)
				}
			}
			if tt.wantQuery != "" && seen.query != tt.wantQuery {
				t.Errorf("server saw query %q, want %q", seen.query, tt.wantQuery)
			}

			// Nothing leaving the package may contain the secret.
			if strings.Contains(resp.URL, secret) {
				t.Errorf("reported URL leaks the secret: %s", resp.URL)
			}
			for name, v := range resp.SentHeaders {
				if strings.Contains(v, secret) {
					t.Errorf("SentHeaders[%s] leaks the secret: %q", name, v)
				}
			}
			if tt.wantQuery != "" && !strings.Contains(resp.URL, "api_key="+RedactedValue) {
				t.Errorf("query credential not marked redacted in URL: %s", resp.URL)
			}
		})
	}
}

func TestCredentialResolveErrors(t *testing.T) {
	ctx := context.Background()
	req := Request{Method: "GET", EnvBase: "https://x.io", Path: "/p"}
	bad := []struct {
		name string
		cred Credential
	}{
		{"unknown kind", Credential{Kind: "oauth", Secret: "s"}},
		{"empty secret", Credential{Kind: KindBearer}},
		{"header kind without header name", Credential{Kind: KindHeader, Secret: "s"}},
		{"query kind without param name", Credential{Kind: KindQuery, Secret: "s"}},
		{"template without placeholder", Credential{Kind: KindHeader, Header: "X", Template: "Token", Secret: "s"}},
		{"template with two placeholders", Credential{Kind: KindHeader, Header: "X", Template: "{secret}{secret}", Secret: "s"}},
	}
	for _, tt := range bad {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := Do(ctx, nil, req, &tt.cred); err == nil {
				t.Error("invalid credential accepted")
			}
		})
	}
}

func TestValidateTemplate(t *testing.T) {
	if err := ValidateTemplate(""); err != nil {
		t.Errorf("empty template (default) rejected: %v", err)
	}
	if err := ValidateTemplate("Splunk {secret}"); err != nil {
		t.Errorf("valid template rejected: %v", err)
	}
	if ValidateTemplate("no placeholder") == nil {
		t.Error("template without placeholder accepted")
	}
	if ValidateTemplate("{secret} and {secret}") == nil {
		t.Error("template with two placeholders accepted")
	}
}

func TestValidKind(t *testing.T) {
	for _, kind := range []string{KindBearer, KindBasic, KindHeader, KindQuery} {
		if !ValidKind(kind) {
			t.Errorf("kind %q rejected", kind)
		}
	}
	if ValidKind("api-key") {
		t.Error("legacy api-key kind accepted — it became kind header")
	}
}
