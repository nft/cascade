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

// BoardNode mirrors core.Node (id, type, name) and carries the node's form
// data opaquely — the store does not interpret it.
type BoardNode struct {
	ID   string         `json:"id"`
	Type string         `json:"type,omitempty"`
	Name string         `json:"name,omitempty"`
	Data map[string]any `json:"data,omitempty"`
}

// BoardEdge mirrors core.Edge; ID is canvas-only.
type BoardEdge struct {
	ID   string `json:"id,omitempty"`
	From string `json:"from"`
	To   string `json:"to"`
}

// BoardLayout is canvas-only data (node positions, viewport, last responses)
// that the engine ignores.
type BoardLayout struct {
	Positions map[string]Position `json:"positions"`
	Viewport  *Viewport           `json:"viewport,omitempty"`
	// Responses holds each node's last successful response (plan 05 §8) for
	// schema inference and picker previews; written by the frontend and
	// treated opaquely by the store.
	Responses map[string]any `json:"responses,omitempty"`
}

// Position is a node's canvas coordinate.
type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
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

// graph converts the board to the engine's graph model.
func (b Board) graph() core.Graph {
	g := core.Graph{
		Nodes: make([]core.Node, len(b.Nodes)),
		Edges: make([]core.Edge, len(b.Edges)),
	}
	for i, n := range b.Nodes {
		g.Nodes[i] = core.Node{ID: core.NodeID(n.ID), Type: core.NodeType(n.Type), Name: n.Name}
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
	g := b.graph()
	if err := g.Validate(); err != nil {
		return fmt.Errorf("board %q: %w", b.ID, err)
	}
	return nil
}
