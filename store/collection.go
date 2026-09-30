package store

import "fmt"

// CollectionFormatVersion is the on-disk format version of a collection file.
const CollectionFormatVersion = 1

// maxFolderDepth caps folder nesting inside a collection: the
// root folder is depth 0, so at most three named folder levels below it.
const maxFolderDepth = 3

// Request protocols. Only http executes today; ws is a reserved
// discriminator so collection/board files never need a format break when
// WebSocket support lands.
const (
	ProtocolHTTP = "http"
	ProtocolWS   = "ws"
)

// RequestDef is one reusable request definition inside a collection. Like
// board node data, the request's form payload (defaults, schemas) is carried
// opaquely — the store validates structure, not request semantics.
type RequestDef struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Protocol string `json:"protocol"`
	Method   string `json:"method,omitempty"`
	// URL is a path resolved against an environment ('/v1/invoices') or an
	// absolute URL carrying its own origin.
	URL string `json:"url"`
	// Defaults are literal field rows copied onto new nodes; opaque here.
	Defaults []map[string]any `json:"defaults,omitempty"`
	// RawBody is a raw-body request definition; opaque here.
	RawBody map[string]any `json:"rawBody,omitempty"`
	// RequestSchema / ResponseSchema are JSON-schema shapes;
	// opaque here.
	RequestSchema  map[string]any `json:"requestSchema,omitempty"`
	ResponseSchema map[string]any `json:"responseSchema,omitempty"`
	Description    string         `json:"description,omitempty"`
}

// CollectionFolder is one nestable folder of request definitions.
type CollectionFolder struct {
	ID       string             `json:"id"`
	Name     string             `json:"name"`
	Folders  []CollectionFolder `json:"folders,omitempty"`
	Requests []RequestDef       `json:"requests"`
}

// Collection is a project-scoped library of request definitions,
// persisted as collections/<id>.json — versioned, diff-friendly, secret-free.
type Collection struct {
	FormatVersion int    `json:"formatVersion"`
	ID            string `json:"id"`
	Name          string `json:"name"`
	// Root is the unnamed root folder; top-level items live in it.
	Root CollectionFolder `json:"root"`
}

// normalize maps absent lists to empty ones so saved files keep a stable,
// diff-friendly shape and Wails serializes [] rather than null.
func (c *Collection) normalize() {
	if c.FormatVersion == 0 {
		c.FormatVersion = CollectionFormatVersion
	}
	c.Root.normalize()
}

func (f *CollectionFolder) normalize() {
	if f.Requests == nil {
		f.Requests = []RequestDef{}
	}
	for i := range f.Folders {
		f.Folders[i].normalize()
	}
}

// validate rejects collections the store could not safely put on disk or
// that violate structural invariants (depth cap, unknown protocol).
func (c Collection) validate() error {
	if !validFileID(c.ID) {
		return fmt.Errorf("collection id %q: %w", c.ID, errBadFileID)
	}
	if c.FormatVersion > CollectionFormatVersion {
		return fmt.Errorf("collection %q: format version %d is newer than supported version %d",
			c.ID, c.FormatVersion, CollectionFormatVersion)
	}
	return c.Root.validate(c.ID, 0)
}

func (f CollectionFolder) validate(collectionID string, depth int) error {
	if depth > maxFolderDepth {
		return fmt.Errorf("collection %q: folder %q exceeds the maximum nesting depth of %d",
			collectionID, f.Name, maxFolderDepth)
	}
	for _, r := range f.Requests {
		if r.Protocol != ProtocolHTTP && r.Protocol != ProtocolWS {
			return fmt.Errorf("collection %q: request %q has unknown protocol %q", collectionID, r.Name, r.Protocol)
		}
	}
	for _, sub := range f.Folders {
		if err := sub.validate(collectionID, depth+1); err != nil {
			return err
		}
	}
	return nil
}
