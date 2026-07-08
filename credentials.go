package main

import (
	"errors"
	"fmt"

	"cascade/core/httpcall"
	"cascade/store"
)

// SaveCredentials replaces the project's credential metadata list (plan 04
// K2). Only metadata travels — secret values go through SetCredentialSecret
// and never appear in store.Credential.
func (a *App) SaveCredentials(projectID string, credentials []store.Credential) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	return p.SaveCredentials(credentials)
}

// DeleteCredential removes one credential's metadata and its stored secret.
// Deleting an unknown name is a no-op, so a retry after a partial failure
// cannot get stuck.
func (a *App) DeleteCredential(projectID, name string) error {
	p, err := a.store.Project(projectID)
	if err != nil {
		return err
	}
	credentials, err := p.Credentials()
	if err != nil {
		return err
	}
	kept := credentials[:0]
	for _, c := range credentials {
		if c.Name != name {
			kept = append(kept, c)
		}
	}
	if err := p.SaveCredentials(kept); err != nil {
		return err
	}
	return a.store.Secrets().DeleteSecret(projectID, name)
}

// SetCredentialSecret stores (or rotates) a credential's secret value. The
// value goes straight to the secret store — never into project files — and is
// write-only: no binding reads it back.
func (a *App) SetCredentialSecret(projectID, name, value string) error {
	if value == "" {
		return fmt.Errorf("secret value must not be empty")
	}
	if _, err := a.findCredential(projectID, name); err != nil {
		return err
	}
	return a.store.Secrets().SetSecret(projectID, name, value)
}

// resolveCredential turns a credential name into an httpcall injection: the
// project's metadata gives the kind/rule, the secret store gives the value.
// A named credential without a stored value is an explicit, actionable error
// rather than a silent no-auth call the user would misread as authenticated.
func (a *App) resolveCredential(projectID, name string) (*httpcall.Credential, error) {
	if name == "" {
		return nil, nil
	}
	c, err := a.findCredential(projectID, name)
	if err != nil {
		return nil, err
	}
	secret, err := a.store.Secrets().GetSecret(projectID, name)
	if errors.Is(err, store.ErrSecretNotFound) {
		return nil, fmt.Errorf(
			"credential %q has no stored secret value — set one in the Credentials tab, or pick None to send without auth",
			name)
	}
	if err != nil {
		return nil, err
	}
	return &httpcall.Credential{
		Kind:     c.Kind,
		Header:   c.Header,
		Param:    c.Param,
		Template: c.Template,
		Secret:   secret,
		Username: c.Username,
	}, nil
}

// findCredential returns the named credential's metadata.
func (a *App) findCredential(projectID, name string) (store.Credential, error) {
	p, err := a.store.Project(projectID)
	if err != nil {
		return store.Credential{}, err
	}
	credentials, err := p.Credentials()
	if err != nil {
		return store.Credential{}, err
	}
	for _, c := range credentials {
		if c.Name == name {
			return c, nil
		}
	}
	return store.Credential{}, fmt.Errorf("credential %q does not exist in this project", name)
}
