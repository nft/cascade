package store

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
}

// Environment is a named API target. Default headers land with M4.
type Environment struct {
	Name    string `json:"name"`
	BaseURL string `json:"baseUrl"`
}

// Credential is credential metadata ONLY — secret values never touch project
// files; they live in the OS keychain (plan 04, see SecretStore).
type Credential struct {
	Name      string            `json:"name"`
	Kind      string            `json:"kind"`
	CreatedAt string            `json:"createdAt,omitempty"`
	Config    map[string]string `json:"config,omitempty"`
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
// Real OpenAPI import lands with M2; the catalog shape is stable now.
type Source struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Version    string      `json:"version,omitempty"`
	Operations []Operation `json:"operations"`
}
