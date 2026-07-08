package main

import (
	"context"
	"fmt"

	"cascade/core/httpcall"
)

// TestRequest is one one-off request execution from the request editor's Test
// tab (plan 08 B4/C9): fully resolved literal values, no board, no run. The
// frontend never sees secret values — only the credential *name* travels.
type TestRequest struct {
	Protocol   string            `json:"protocol,omitempty"`
	Method     string            `json:"method"`
	Origin     string            `json:"origin,omitempty"`
	EnvBase    string            `json:"envBase,omitempty"`
	Path       string            `json:"path"`
	PathParams map[string]string `json:"pathParams,omitempty"`
	Query      map[string]string `json:"query,omitempty"`
	Headers    map[string]string `json:"headers,omitempty"`
	Body       any               `json:"body,omitempty"`
	RawBody    *httpcall.RawBody `json:"rawBody,omitempty"`
	Credential string            `json:"credential,omitempty"`
}

// TestResponse is the captured outcome handed back to the Test tab.
type TestResponse struct {
	Status      int               `json:"status"`
	Headers     map[string]string `json:"headers,omitempty"`
	Body        any               `json:"body,omitempty"`
	BodyText    string            `json:"bodyText"`
	Truncated   bool              `json:"truncated,omitempty"`
	DurationMs  int               `json:"durationMs"`
	URL         string            `json:"url"`
	SentHeaders map[string]string `json:"sentHeaders,omitempty"`
}

// SendTestRequest executes one test request through the shared httpcall build
// path (credential injection, redaction, capped capture) outside any board or
// run — no node states, no run log entries.
func (a *App) SendTestRequest(projectID string, req TestRequest) (TestResponse, error) {
	cred, err := a.resolveCredential(projectID, req.Credential)
	if err != nil {
		return TestResponse{}, err
	}
	ctx := a.ctx
	if ctx == nil {
		ctx = context.Background()
	}
	resp, err := httpcall.Do(ctx, nil, httpcall.Request{
		Protocol:   req.Protocol,
		Method:     req.Method,
		Origin:     req.Origin,
		EnvBase:    req.EnvBase,
		Path:       req.Path,
		PathParams: req.PathParams,
		Query:      req.Query,
		Headers:    req.Headers,
		Body:       req.Body,
		RawBody:    req.RawBody,
	}, cred)
	if err != nil {
		return TestResponse{}, err
	}
	return TestResponse{
		Status:      resp.Status,
		Headers:     resp.Headers,
		Body:        resp.Body,
		BodyText:    resp.BodyText,
		Truncated:   resp.Truncated,
		DurationMs:  resp.DurationMs,
		URL:         resp.URL,
		SentHeaders: resp.SentHeaders,
	}, nil
}

// resolveCredential turns a credential name into an httpcall injection. Names
// resolve against the project's credential metadata, but secret *values* live
// in the OS keychain, which lands with plan 04 — until then any named
// credential is an explicit, actionable error rather than a silent no-auth
// call the user would misread as authenticated.
func (a *App) resolveCredential(projectID, name string) (*httpcall.Credential, error) {
	if name == "" {
		return nil, nil
	}
	p, err := a.store.Project(projectID)
	if err != nil {
		return nil, err
	}
	credentials, err := p.Credentials()
	if err != nil {
		return nil, err
	}
	for _, c := range credentials {
		if c.Name == name {
			return nil, fmt.Errorf(
				"credential %q: secret values are not stored yet (they land with plan 04) — pick None to send without auth",
				name)
		}
	}
	return nil, fmt.Errorf("credential %q does not exist in this project", name)
}
