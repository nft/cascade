package store

import (
	"fmt"

	"cascade/core"
)

// BoardFormatVersion tracks core.FormatVersion: a board file is the M1 graph
// format plus a sibling layout key the engine ignores.
const BoardFormatVersion = core.FormatVersion

// Board is one canvas inside a project: an engine-readable graph (nodes,
// edges) plus canvas-only layout.
type Board struct {
	FormatVersion int         `json:"formatVersion"`
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	Nodes         []BoardNode `json:"nodes"`
	Edges         []BoardEdge `json:"edges"`
	Layout        BoardLayout `json:"layout"`
}

// BoardNode mirrors core.Node (id, type, name, parent) and carries the node's
// form data opaquely — the store does not interpret it.
type BoardNode struct {
	ID     string         `json:"id"`
	Type   string         `json:"type,omitempty"`
	Name   string         `json:"name,omitempty"`
	Parent string         `json:"parent,omitempty"`
	Data   map[string]any `json:"data,omitempty"`
}

// BoardEdge mirrors core.Edge; ID is canvas-only.
type BoardEdge struct {
	ID   string `json:"id,omitempty"`
	From string `json:"from"`
	To   string `json:"to"`
}

// BoardLayout is canvas-only data (node positions, sizes, viewport, last
// responses) that the engine ignores.
type BoardLayout struct {
	Positions map[string]Position `json:"positions"`
	// Sizes holds explicit node dimensions; only resizable For containers
	// (plan 09) have one, so most nodes are absent here.
	Sizes    map[string]Size `json:"sizes,omitempty"`
	Viewport *Viewport       `json:"viewport,omitempty"`
	// Responses holds each node's last successful response (plan 05 §8) for
	// schema inference and picker previews; written by the frontend.
	Responses map[string]CapturedResponse `json:"responses,omitempty"`
}

// Position is a node's canvas coordinate.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

// Size is a node's explicit canvas dimensions.
type Size struct {
	Width  float64 `json:"width"`
	Height float64 `json:"height"`
}

// CapturedResponse is one node's last captured response, mirroring the
// frontend's CapturedResponse (frontend/src/lib/model.ts). At is the ISO
// capture timestamp, kept as text so a save round trip is byte-stable.
type CapturedResponse struct {
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers,omitempty"`
	// Body is absent when the project has response capture turned off (and,
	// harmlessly, when the response body was JSON null); Schema is written
	// either way, so a board whose bodies were never persisted still drives
	// the binding picker. Both are untyped because nothing here reads them —
	// the store's only obligation is to not drop them, and an undeclared
	// field is dropped silently on every save.
	Body      any    `json:"body,omitempty"`
	Schema    any    `json:"schema,omitempty"`
	At        string `json:"at"`
	Truncated bool   `json:"truncated,omitempty"`
}

// Viewport is the canvas pan/zoom state.
type Viewport struct {
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	Zoom float64 `json:"zoom"`
}

// normalize maps absent collections to empty ones so saved files keep a
// stable, diff-friendly shape and Wails serializes [] rather than null.
func (b *Board) normalize() {
	if b.FormatVersion == 0 {
		b.FormatVersion = BoardFormatVersion
	}
	if b.Nodes == nil {
		b.Nodes = []BoardNode{}
	}
	if b.Edges == nil {
		b.Edges = []BoardEdge{}
	}
	if b.Layout.Positions == nil {
		b.Layout.Positions = map[string]Position{}
	}
}

// Graph converts the board to the engine's graph model. Exported because the
// app layer runs a board the frontend just handed it, which never reached
// disk.
func (b Board) Graph() core.Graph {
	g := core.Graph{
		Nodes: make([]core.Node, len(b.Nodes)),
		Edges: make([]core.Edge, len(b.Edges)),
	}
	for i, n := range b.Nodes {
		g.Nodes[i] = core.Node{
			ID:     core.NodeID(n.ID),
			Type:   core.NodeType(n.Type),
			Name:   n.Name,
			Parent: core.NodeID(n.Parent),
		}
	}
	for i, e := range b.Edges {
		g.Edges[i] = core.Edge{From: core.NodeID(e.From), To: core.NodeID(e.To)}
	}
	return g
}

// validate rejects boards the engine could not run or the store could not
// safely put on disk (the id doubles as the file name).
func (b Board) validate() error {
	if !validFileID(b.ID) {
		return fmt.Errorf("board id %q: %w", b.ID, errBadFileID)
	}
	if b.FormatVersion > BoardFormatVersion {
		return fmt.Errorf("board %q: format version %d is newer than supported version %d",
			b.ID, b.FormatVersion, BoardFormatVersion)
	}
	g := b.Graph()
	if err := g.Validate(); err != nil {
		return fmt.Errorf("board %q: %w", b.ID, err)
	}
	return nil
}
