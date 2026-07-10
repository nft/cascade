package share

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"cascade/store"
)

// ExportBoard renders one stored board as a kind:board envelope.
func ExportBoard(p *store.Project, boardID string) ([]byte, error) {
	b, err := p.Board(boardID)
	if err != nil {
		return nil, err
	}
	all := make([]string, len(b.Nodes))
	for i, n := range b.Nodes {
		all[i] = n.ID
	}
	return export(p, b, KindBoard, all)
}

// ExportSelection renders a subset of a board as a kind:selection envelope.
// The board is passed in rather than loaded, because a selection is copied
// from the live canvas, which may be ahead of the last save. Only edges
// between selected nodes travel; bindings that reach outside the selection
// are exported unbound, flagged dangling with the upstream's key.
func ExportSelection(p *store.Project, board store.Board, nodeIDs []string) ([]byte, error) {
	if len(nodeIDs) == 0 {
		return nil, errors.New("nothing selected")
	}
	return export(p, board, KindSelection, nodeIDs)
}

func export(p *store.Project, b store.Board, kind string, selected []string) ([]byte, error) {
	keep := make(map[string]bool, len(selected))
	for _, id := range selected {
		keep[id] = true
	}
	upstream := singleUpstreams(b.Edges)
	idToKey := make(map[string]string, len(b.Nodes))
	for _, n := range b.Nodes {
		idToKey[n.ID] = dataString(n.Data, dataKeyKey)
	}

	out := store.Board{
		FormatVersion: b.FormatVersion,
		Nodes:         []store.BoardNode{},
		Edges:         []store.BoardEdge{},
	}
	if out.FormatVersion == 0 {
		out.FormatVersion = store.BoardFormatVersion
	}
	// A selection has no identity of its own — id/name stay empty and the
	// importer assigns both.
	if kind == KindBoard {
		out.ID, out.Name = b.ID, b.Name
	}

	for _, n := range b.Nodes {
		if !keep[n.ID] {
			continue
		}
		data, err := deepCopyData(n.Data)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", n.ID, err)
		}
		sanitizeRunState(data)
		rewriteDanglingBindings(data, n.ID, keep, upstream, idToKey)
		out.Nodes = append(out.Nodes, store.BoardNode{ID: n.ID, Type: n.Type, Name: n.Name, Data: data})
	}
	if len(out.Nodes) == 0 {
		return nil, errors.New("selection matched no nodes")
	}
	for _, e := range b.Edges {
		if keep[e.From] && keep[e.To] {
			out.Edges = append(out.Edges, e)
		}
	}
	// Positions travel so relative layout survives; viewport and captured
	// responses are deliberately dropped — pan/zoom is the receiver's, and
	// last responses are run data that has no business leaving the machine.
	out.Layout.Positions = map[string]store.Position{}
	for id, pos := range b.Layout.Positions {
		if keep[id] {
			out.Layout.Positions[id] = pos
		}
	}

	requires, err := deriveRequires(p, out.Nodes)
	if err != nil {
		return nil, err
	}
	collections, err := embedCollections(p, out.Nodes)
	if err != nil {
		return nil, err
	}
	return marshal(Envelope{Cascade: Payload{
		Kind:          kind,
		FormatVersion: EnvelopeFormatVersion,
		App:           producerApp,
		Board:         out,
		Requires:      requires,
		Collections:   collections,
	}})
}

// sanitizeRunState resets run products on an exported copy: the receiver
// gets idle nodes, and re-exports diff cleanly regardless of who ran what.
func sanitizeRunState(data map[string]any) {
	if data == nil {
		return
	}
	if _, ok := data[dataKeyStatus]; ok {
		data[dataKeyStatus] = statusIdle
	}
	delete(data, dataKeyNote)
}

// rewriteDanglingBindings unbinds field rows whose reference leaves the kept
// set. The row keeps a dangling marker naming the upstream by KEY (IDs are
// meaningless to the receiver), so the importer can show "was bound to
// createUser.body.id" and the user re-binds — never a silent wrong value.
func rewriteDanglingBindings(
	data map[string]any,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) {
	for _, listKey := range []string{dataKeyFields, dataKeyPick} {
		for _, row := range fieldRows(data, listKey) {
			switch dataString(row, fieldKeySource) {
			case sourceBinding:
				rewriteDanglingRef(row, nodeID, keep, upstream, idToKey)
			case sourceTemplate:
				rewriteDanglingTemplate(row, nodeID, keep, upstream, idToKey)
			}
		}
	}
}

func rewriteDanglingRef(
	row map[string]any,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) {
	target, path, ok := refTarget(row)
	if !ok {
		return
	}
	if target == "" { // res sugar: the single direct upstream via the edge
		target = upstream[nodeID]
	}
	// No upstream at all, or an id foreign to the source board: nothing to
	// dangle against; the graph validator owns that case.
	if target == "" || keep[target] || idToKey[target] == "" {
		return
	}
	row[fieldKeyDangling] = map[string]any{
		danglingKeyOriginal: idToKey[target],
		danglingKeyPath:     path,
	}
	row[fieldKeySource] = sourceLiteral
	row[fieldKeyValue] = ""
	delete(row, fieldKeyRef)
}

// rewriteDanglingTemplate rewrites a template's external {{id.path}} tokens
// to {{key.path}} — human-readable, and unresolvable on the target board, so
// the reference surfaces as invalid instead of silently binding to whatever
// node happens to share the id or position.
func rewriteDanglingTemplate(
	row map[string]any,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) {
	value := dataString(row, fieldKeyValue)
	if value == "" {
		return
	}
	dangled := false
	rewritten := templateRefPattern.ReplaceAllStringFunc(value, func(token string) string {
		inner := strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(token, "{{"), "}}"))
		head, rest, hasPath := strings.Cut(inner, ".")
		target := head
		if head == resToken {
			target = upstream[nodeID]
		}
		if head == fanOutIndexToken || target == "" || keep[target] || idToKey[target] == "" {
			return token
		}
		if !dangled {
			dangled = true
			row[fieldKeyDangling] = map[string]any{
				danglingKeyOriginal: idToKey[target],
				danglingKeyPath:     rest,
			}
		}
		key := idToKey[target]
		if hasPath {
			return "{{" + key + "." + rest + "}}"
		}
		return "{{" + key + "}}"
	})
	if dangled {
		row[fieldKeyValue] = rewritten
	}
}

// deriveRequires collects the environment and credential names the exported
// nodes reference. Credentials carry their kind as a mapping hint when the
// project still knows the name; a dangling reference exports with no kind.
func deriveRequires(p *store.Project, nodes []store.BoardNode) (Requires, error) {
	envs := map[string]bool{}
	creds := map[string]bool{}
	for _, n := range nodes {
		if env := dataString(n.Data, dataKeyEnvironment); env != "" {
			envs[env] = true
		}
		if cred := dataString(n.Data, dataKeyCredential); cred != "" {
			creds[cred] = true
		}
	}
	requires := Requires{
		Environments: sortedKeys(envs),
		Credentials:  []CredentialRequirement{},
		Sources:      []SourceRequirement{},
	}
	if len(creds) > 0 {
		known, err := p.Credentials()
		if err != nil {
			return Requires{}, err
		}
		kinds := make(map[string]string, len(known))
		for _, c := range known {
			kinds[c.Name] = c.Kind
		}
		for _, name := range sortedKeys(creds) {
			requires.Credentials = append(requires.Credentials,
				CredentialRequirement{Name: name, Kind: kinds[name]})
		}
	}
	return requires, nil
}

// embedCollections gathers the request definitions referenced by the nodes'
// requestRef provenance links (plan 08's requirement on this plan), trimmed
// to the referenced requests and flattened into each collection's root — the
// link is by request id, so folder placement need not survive the trip.
func embedCollections(p *store.Project, nodes []store.BoardNode) ([]store.Collection, error) {
	wanted := map[string]map[string]bool{} // collectionID -> requestIDs
	for _, n := range nodes {
		collectionID, requestID, ok := requestRef(n.Data)
		if !ok || collectionID == "" || requestID == "" {
			continue
		}
		if wanted[collectionID] == nil {
			wanted[collectionID] = map[string]bool{}
		}
		wanted[collectionID][requestID] = true
	}
	if len(wanted) == 0 {
		return nil, nil
	}
	all, err := p.Collections()
	if err != nil {
		return nil, err
	}
	byID := make(map[string]store.Collection, len(all))
	for _, c := range all {
		byID[c.ID] = c
	}
	embedded := []store.Collection{}
	for _, collectionID := range sortedKeys(wanted) {
		src, ok := byID[collectionID]
		if !ok {
			continue // collection deleted since — the node works standalone
		}
		requests := collectRequests(src.Root, wanted[collectionID])
		if len(requests) == 0 {
			continue
		}
		sort.Slice(requests, func(i, j int) bool { return requests[i].ID < requests[j].ID })
		embedded = append(embedded, store.Collection{
			FormatVersion: src.FormatVersion,
			ID:            src.ID,
			Name:          src.Name,
			Root:          store.CollectionFolder{ID: exportRootFolderID, Name: "", Requests: requests},
		})
	}
	if len(embedded) == 0 {
		return nil, nil
	}
	return embedded, nil
}

// exportRootFolderID names the synthetic root of a trimmed embedded
// collection; import matches requests by id, so the folder id is cosmetic.
const exportRootFolderID = "root"

func collectRequests(folder store.CollectionFolder, wanted map[string]bool) []store.RequestDef {
	requests := []store.RequestDef{}
	for _, r := range folder.Requests {
		if wanted[r.ID] {
			requests = append(requests, r)
		}
	}
	for _, sub := range folder.Folders {
		requests = append(requests, collectRequests(sub, wanted)...)
	}
	return requests
}

// singleUpstreams maps each node to its single direct upstream — the node
// the `res` sugar refers to. Nodes with zero or several upstreams map to "".
func singleUpstreams(edges []store.BoardEdge) map[string]string {
	counts := map[string]int{}
	from := map[string]string{}
	for _, e := range edges {
		counts[e.To]++
		from[e.To] = e.From
	}
	for to, n := range counts {
		if n != 1 {
			delete(from, to)
		}
	}
	return from
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
