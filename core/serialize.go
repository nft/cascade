package core

import (
	"encoding/json"
	"fmt"
)

// FormatVersion is the current graph serialization format version. Graph JSON
// carries it from day one so a newer format is rejected cleanly instead
// of being misread; adding the node type discriminator did not bump it
// because absent types default to http.
const FormatVersion = 1

type graphJSON struct {
	FormatVersion int    `json:"formatVersion"`
	Nodes         []Node `json:"nodes"`
	Edges         []Edge `json:"edges"`
}

func (g Graph) MarshalJSON() ([]byte, error) {
	doc := graphJSON{FormatVersion: FormatVersion, Nodes: g.Nodes, Edges: g.Edges}
	// Empty collections serialize as [] rather than null: exports are meant
	// to live in git, and stable shapes diff better.
	if doc.Nodes == nil {
		doc.Nodes = []Node{}
	}
	if doc.Edges == nil {
		doc.Edges = []Edge{}
	}
	return json.Marshal(doc)
}

func (g *Graph) UnmarshalJSON(data []byte) error {
	var doc graphJSON
	if err := json.Unmarshal(data, &doc); err != nil {
		return err
	}
	// A missing formatVersion (0) is read as version 1; only newer versions
	// are rejected.
	if doc.FormatVersion > FormatVersion {
		return fmt.Errorf("graph format version %d is newer than supported version %d", doc.FormatVersion, FormatVersion)
	}
	g.Nodes = doc.Nodes
	g.Edges = doc.Edges
	return nil
}

func (n Node) MarshalJSON() ([]byte, error) {
	// alias sheds Node's methods so json.Marshal does not recurse.
	type alias Node
	a := alias(n)
	if a.Type == "" {
		a.Type = NodeTypeHTTP
	}
	return json.Marshal(a)
}

func (n *Node) UnmarshalJSON(data []byte) error {
	type alias Node
	var a alias
	if err := json.Unmarshal(data, &a); err != nil {
		return err
	}
	// Boards saved before the type discriminator existed carry no "type";
	// every node then was an http node (this is what keeps formatVersion at 1).
	if a.Type == "" {
		a.Type = NodeTypeHTTP
	}
	if !a.Type.valid() {
		return fmt.Errorf("node %q: unknown node type %q", a.ID, a.Type)
	}
	*n = Node(a)
	return nil
}
