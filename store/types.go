package store

import (
	"fmt"
	"strings"

	"cascade/core/httpcall"
)

// ProjectInfo is one entry in the projects.json index.
type ProjectInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// Path is the project directory, slash-separated and relative to the
	// store root unless absolute. Kept per entry so "open folder as project"
	// stays additive.
	Path         string `json:"path"`
	LastOpenedAt string `json:"lastOpenedAt,omitempty"`
}

// Defaults are the project-wide fallbacks applied to newly added nodes, so a
// fresh node needs no manual target setup.
type Defaults struct {
	Environment string `json:"environment,omitempty"`
	Credential  string `json:"credential,omitempty"`
}

// ProjectMeta is the content of project.json.
type ProjectMeta struct {
	FormatVersion int      `json:"formatVersion"`
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	CreatedAt     string   `json:"createdAt"`
	Defaults      Defaults `json:"defaults"`
	// CaptureResponses gates writing response bodies into board files, which
	// are meant to live in git and now hold real API responses. A pointer
	// because absent must mean on: every project written before this field
	// existed omits it, and a plain bool could not tell that from an explicit
	// off. Read it through CapturesResponses.
	CaptureResponses *bool `json:"captureResponses,omitempty"`
}

// CapturesResponses reports whether response bodies may be written into this
// project's board files. Unset means yes — the default is the permissive one,
// so nothing a user already relies on changes when the setting arrives.
func (m ProjectMeta) CapturesResponses() bool {
	return m.CaptureResponses == nil || *m.CaptureResponses
}

// Environment is a named API target. It has no default headers yet.
type Environment struct {
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
}

// Credential is credential metadata ONLY — secret values never touch project
// files; they live in the OS keychain (see SecretStore). Kind and
// the kind-specific fields mirror httpcall's injection matrix.
type Credential struct {
	Name      string `json:"name"`
	Kind      string `json:"kind"`               // bearer | basic | header | query
	Header    string `json:"header,omitempty"`   // kind header: header name
	Param     string `json:"param,omitempty"`    // kind query: parameter name
	Template  string `json:"template,omitempty"` // optional; "" means {secret}
	Username  string `json:"username,omitempty"` // kind basic; the secret is the password
	CreatedAt string `json:"createdAt,omitempty"`
}

// validateCredential rejects metadata the injection engine (core/httpcall)
// could not execute: unknown kind, a header/query kind missing its target
// name, or a malformed value template.
func validateCredential(c Credential) error {
	if strings.TrimSpace(c.Name) == "" {
		return fmt.Errorf("credential has no name")
	}
	if !httpcall.ValidKind(c.Kind) {
		return fmt.Errorf("credential %q: unknown kind %q", c.Name, c.Kind)
	}
	if c.Kind == httpcall.KindHeader && strings.TrimSpace(c.Header) == "" {
		return fmt.Errorf("credential %q: kind %q needs a header name", c.Name, c.Kind)
	}
	if c.Kind == httpcall.KindQuery && strings.TrimSpace(c.Param) == "" {
		return fmt.Errorf("credential %q: kind %q needs a query parameter name", c.Name, c.Kind)
	}
	if err := httpcall.ValidateTemplate(c.Template); err != nil {
		return fmt.Errorf("credential %q: %w", c.Name, err)
	}
	return nil
}

// Operation is one callable entry in a source's parsed catalog.
type Operation struct {
	Ref     string `json:"ref"`
	Method  string `json:"method"`
	Path    string `json:"path"`
	Summary string `json:"summary,omitempty"`
	Group   string `json:"group,omitempty"`
}

// Source is an imported schema document plus its parsed operation catalog.
// Real OpenAPI import is not built yet; the catalog shape is stable now.
type Source struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Version    string      `json:"version,omitempty"`
	Operations []Operation `json:"operations"`
}
