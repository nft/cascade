package main

import (
	"net/http"
	"net/http/httptest"
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

// Until plan 04's keychain lands there are no secret values anywhere, so a
// named credential must fail loudly instead of silently sending without auth.
func TestSendTestRequestCredentialNotStoredYet(t *testing.T) {
	app := newTestApp(t)
	id := defaultProjectID(t, app)
	// The bootstrapped Default project seeds credentials (seed/default.json).
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
	if err == nil || !strings.Contains(err.Error(), "plan 04") {
		t.Errorf("named credential: err = %v, want the plan-04 explanation", err)
	}

	_, err = app.SendTestRequest(id, TestRequest{
		Method: "GET", EnvBase: "https://x.io", Path: "/me", Credential: "ghost",
	})
	if err == nil || !strings.Contains(err.Error(), "does not exist") {
		t.Errorf("unknown credential: err = %v, want a does-not-exist error", err)
	}
}

func TestSendTestRequestRejectsWS(t *testing.T) {
	app := newTestApp(t)
	_, err := app.SendTestRequest(defaultProjectID(t, app), TestRequest{
		Protocol: "ws", Method: "GET", EnvBase: "https://x.io", Path: "/events",
	})
	if err == nil || !strings.Contains(err.Error(), "ws") {
		t.Errorf("ws request: err = %v, want a protocol rejection (plan 08 C10)", err)
	}
}
