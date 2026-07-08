package main

import (
	"errors"
	"strings"
	"testing"

	"cascade/store"
)

// newSecretBackedApp builds an App over a real FileSecretStore so credential
// CRUD can be asserted end to end (metadata file + secret store together).
func newSecretBackedApp(t *testing.T) (*App, string) {
	t.Helper()
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
	return app, defaultProjectID(t, app)
}

func TestSaveCredentialsValidates(t *testing.T) {
	app, id := newSecretBackedApp(t)

	good := []store.Credential{{Name: "internal", Kind: "header", Header: "X-Internal-Token", Template: "Token {secret}"}}
	if err := app.SaveCredentials(id, good); err != nil {
		t.Fatalf("SaveCredentials (valid): %v", err)
	}

	bad := []store.Credential{{Name: "broken", Kind: "header"}} // header kind without a header name
	if err := app.SaveCredentials(id, bad); err == nil {
		t.Error("SaveCredentials accepted a header credential without a header name")
	}

	// The failed save must not have clobbered the previous list.
	p, err := app.store.Project(id)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	creds, err := p.Credentials()
	if err != nil {
		t.Fatalf("Credentials: %v", err)
	}
	if len(creds) != 1 || creds[0].Name != "internal" {
		t.Errorf("credentials after rejected save = %+v, want the previous list intact", creds)
	}
}

func TestDeleteCredentialRemovesMetadataAndSecret(t *testing.T) {
	app, id := newSecretBackedApp(t)

	creds := []store.Credential{
		{Name: "internal", Kind: "header", Header: "X-Internal-Token"},
		{Name: "admin", Kind: "bearer"},
	}
	if err := app.SaveCredentials(id, creds); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}
	if err := app.SetCredentialSecret(id, "internal", "s3cret"); err != nil {
		t.Fatalf("SetCredentialSecret: %v", err)
	}

	if err := app.DeleteCredential(id, "internal"); err != nil {
		t.Fatalf("DeleteCredential: %v", err)
	}

	p, err := app.store.Project(id)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	left, err := p.Credentials()
	if err != nil {
		t.Fatalf("Credentials: %v", err)
	}
	if len(left) != 1 || left[0].Name != "admin" {
		t.Errorf("credentials after delete = %+v, want only admin", left)
	}
	if _, err := app.store.Secrets().GetSecret(id, "internal"); !errors.Is(err, store.ErrSecretNotFound) {
		t.Errorf("secret survived credential delete: %v", err)
	}

	// Idempotent: deleting a name that is already gone is not an error.
	if err := app.DeleteCredential(id, "internal"); err != nil {
		t.Errorf("second delete: %v", err)
	}
}

func TestSetCredentialSecretRejectsEmptyValue(t *testing.T) {
	app, id := newSecretBackedApp(t)
	creds := []store.Credential{{Name: "admin", Kind: "bearer"}}
	if err := app.SaveCredentials(id, creds); err != nil {
		t.Fatalf("SaveCredentials: %v", err)
	}
	err := app.SetCredentialSecret(id, "admin", "")
	if err == nil || !strings.Contains(err.Error(), "must not be empty") {
		t.Errorf("empty secret: err = %v, want a must-not-be-empty rejection", err)
	}
}
