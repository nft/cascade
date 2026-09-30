package main

import (
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cascade/store"
)

func newTestApp(t *testing.T) *App {
	t.Helper()
	manager := store.NewManager(t.TempDir(), nil)
	if err := bootstrapDefaultProject(manager); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	return NewApp(manager)
}

func defaultProjectID(t *testing.T, app *App) string {
	t.Helper()
	projects, err := app.ListProjects()
	if err != nil || len(projects) == 0 {
		t.Fatalf("ListProjects: %+v, %v", projects, err)
	}
	return projects[0].ID
}

func TestSendTestRequest(t *testing.T) {
	var sawPath, sawBody string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawPath = r.URL.Path
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		sawBody = string(buf)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_, _ = w.Write([]byte(`{"id":"inv_1"}`))
	}))
	defer srv.Close()

	app := newTestApp(t)
	resp, err := app.SendTestRequest(defaultProjectID(t, app), TestRequest{
		Method:     "POST",
		EnvBase:    srv.URL,
		Path:       "/v1/orgs/{id}/invoices",
		PathParams: map[string]string{"id": "org_1"},
		Body:       map[string]any{"amount": "100"},
	})
	if err != nil {
		t.Fatalf("SendTestRequest: %v", err)
	}
	if sawPath != "/v1/orgs/org_1/invoices" || sawBody != `{"amount":"100"}` {
		t.Errorf("server saw path %q body %q", sawPath, sawBody)
	}
	if resp.Status != http.StatusCreated {
		t.Errorf("status = %d", resp.Status)
	}
	body, ok := resp.Body.(map[string]any)
	if !ok || body["id"] != "inv_1" {
		t.Errorf("body = %#v", resp.Body)
	}
}

// A named credential without a stored secret must fail loudly instead of
// silently sending without auth; an unknown name is its own error.
func TestSendTestRequestCredentialErrors(t *testing.T) {
	app := newTestApp(t)
	id := defaultProjectID(t, app)
	p, err := app.store.Project(id)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if err := p.SaveCredentials([]store.Credential{{Name: "staging-admin", Kind: "bearer"}}); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}

	_, err = app.SendTestRequest(id, TestRequest{
		Method: "GET", EnvBase: "https://x.io", Path: "/me", Credential: "staging-admin",
	})
	if err == nil || !strings.Contains(err.Error(), "no stored secret value") {
		t.Errorf("named credential without secret: err = %v, want a no-stored-value explanation", err)
	}

	_, err = app.SendTestRequest(id, TestRequest{
		Method: "GET", EnvBase: "https://x.io", Path: "/me", Credential: "ghost",
	})
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Errorf("unknown credential: err = %v, want a does-not-exist error", err)
	}
}

// The credential scenario at the backend level: a header-kind credential with a
// template sends exactly <Header>: Token <secret>, the response redacts it,
// and no file under the store root contains the secret value.
func TestSendTestRequestWithStoredCredential(t *testing.T) {
	var sawToken string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawToken = r.Header.Get("X-Internal-Token")
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	root := t.TempDir()
	secrets, err := store.NewFileSecretStore(root)
	if err != nil {
		t.Fatalf("NewFileSecretStore: %v", err)
	}
	manager := store.NewManager(root, secrets)
	if err := bootstrapDefaultProject(manager); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	app := NewApp(manager)
	id := defaultProjectID(t, app)

	p, err := app.store.Project(id)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	creds := []store.Credential{{Name: "internal", Kind: "header", Header: "X-Internal-Token", Template: "Token {secret}"}}
	if err := p.SaveCredentials(creds); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}
	const secret = "s3cret-t0ken"
	if err := app.SetCredentialSecret(id, "internal", secret); err != nil {
		t.Fatalf("SetCredentialSecret: %v", err)
	}
	if err := app.SetCredentialSecret(id, "ghost", secret); err == nil {
		t.Error("SetCredentialSecret accepted an unknown credential name")
	}

	resp, err := app.SendTestRequest(id, TestRequest{
		Method: "GET", EnvBase: srv.URL, Path: "/me", Credential: "internal",
	})
	if err != nil {
		t.Fatalf("SendTestRequest: %v", err)
	}
	if sawToken != "Token "+secret {
		t.Errorf("server saw X-Internal-Token %q, want %q", sawToken, "Token "+secret)
	}
	if resp.SentHeaders["X-Internal-Token"] != "•••" {
		t.Errorf("SentHeaders leaks the credential: %v", resp.SentHeaders)
	}

	// Nothing persisted anywhere under the store root may contain the secret.
	err = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if strings.Contains(string(raw), secret) {
			t.Errorf("file %s contains the secret value", path)
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk store root: %v", err)
	}
}

func TestSendTestRequestRejectsWS(t *testing.T) {
	app := newTestApp(t)
	_, err := app.SendTestRequest(defaultProjectID(t, app), TestRequest{
		Protocol: "ws", Method: "GET", EnvBase: "https://x.io", Path: "/events",
	})
	if err == nil || !strings.Contains(err.Error(), "ws") {
		t.Errorf("ws request: err = %v, want a protocol rejection", err)
	}
}
