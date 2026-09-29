package share

import (
	"errors"
	"fmt"
	"sort"
	"strings"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/nodespec"
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
	// Every node's key, not just the kept ones': a cut binding is named by its
	// upstream's KEY, and that upstream is by definition outside the selection.
	idToKey := make(map[string]string, len(b.Nodes))
	for _, n := range b.Nodes {
		spec, err := nodespec.Decode(core.NodeType(n.Type), n.Data)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", n.ID, err)
		}
		idToKey[n.ID] = spec.Key
	}

	specs := make(map[string]nodespec.Spec, len(selected))
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
		// Decode the copy, not n.Data: the rewrite writes into
		// nodespec.Rows(data, …), so the fields it reasons about have to come
		// from that same map for row i to be the one that produced field i.
		spec, err := nodespec.Decode(core.NodeType(n.Type), data)
		if err != nil {
			return nil, fmt.Errorf("node %q: %w", n.ID, err)
		}
		specs[n.ID] = spec
		rewriteDanglingBindings(data, spec, n.ID, keep, upstream, idToKey)
		// Containment travels only when the container is in the selection: a
		// parent naming an absent node is rejected by core.Graph.Validate on
		// import, so a cut child exports as top level — the same treatment
		// rewriteDanglingBindings gives a binding cut by the selection.
		parent := ""
		if keep[n.Parent] {
			parent = n.Parent
		}
		out.Nodes = append(out.Nodes, store.BoardNode{
			ID: n.ID, Type: n.Type, Name: n.Name, Parent: parent, Data: data,
		})
	}
	if len(out.Nodes) == 0 {
		return nil, errors.New("selection matched no nodes")
	}
	for _, e := range b.Edges {
		if keep[e.From] && keep[e.To] {
			out.Edges = append(out.Edges, e)
		}
	}
	// Positions and sizes travel so relative layout survives; viewport and
	// captured responses are deliberately dropped — pan/zoom is the
	// receiver's, and last responses are run data that has no business
	// leaving the machine. The layout is rebuilt field by field, so any field
	// added to store.BoardLayout must be copied here or it is dropped.
	out.Layout.Positions = map[string]store.Position{}
	for id, pos := range b.Layout.Positions {
		if keep[id] {
			out.Layout.Positions[id] = pos
		}
	}
	out.Layout.Sizes = map[string]store.Size{}
	for id, size := range b.Layout.Sizes {
		if keep[id] {
			out.Layout.Sizes[id] = size
		}
	}

	requires, err := deriveRequires(p, out.Nodes, specs)
	if err != nil {
		return nil, err
	}
	collections, err := embedCollections(p, out.Nodes, specs)
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
// The decoded fields and the rows they came from are walked in lockstep:
// reading is nodespec's job, but the marker has to be written back into the
// opaque map, and nodespec.Rows is the very function Decode read them with —
// so spec must have been decoded from data itself.
func rewriteDanglingBindings(
	data map[string]any,
	spec nodespec.Spec,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) {
	var lists []struct {
		key    string
		fields []nodespec.Field
	}
	if spec.HTTP != nil {
		lists = append(lists, struct {
			key    string
			fields []nodespec.Field
		}{nodespec.DataKeyFields, spec.HTTP.Fields})
	}
	if spec.Transform != nil {
		lists = append(lists, struct {
			key    string
			fields []nodespec.Field
		}{nodespec.DataKeyPick, spec.Transform.Pick})
	}
	for _, list := range lists {
		rows := nodespec.Rows(data, list.key)
		for i, field := range list.fields {
			if i >= len(rows) {
				break
			}
			switch field.Source {
			case nodespec.FieldBinding:
				rewriteDanglingRef(rows[i], field, nodeID, keep, upstream, idToKey)
			case nodespec.FieldTemplate:
				rewriteDanglingTemplate(rows[i], field, nodeID, keep, upstream, idToKey)
			}
		}
	}
}

// danglingTarget resolves what a reference points at, or "" when there is
// nothing to dangle against: no upstream at all, a target still in the kept
// set, or an id foreign to the source board — the graph validator owns that
// last case.
func danglingTarget(
	ref binding.Ref,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) string {
	target := ref.Node
	if target == "" { // res sugar: the single direct upstream via the edge
		target = upstream[nodeID]
	}
	if target == "" || keep[target] || idToKey[target] == "" {
		return ""
	}
	return idToKey[target]
}

func rewriteDanglingRef(
	row map[string]any,
	field nodespec.Field,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) {
	if field.Ref == nil {
		return
	}
	key := danglingTarget(field.Ref.Binding(), nodeID, keep, upstream, idToKey)
	if key == "" {
		return
	}
	row[nodespec.FieldKeyDangling] = map[string]any{
		nodespec.DanglingKeyOriginal: key,
		nodespec.DanglingKeyPath:     field.Ref.Path,
	}
	row[nodespec.FieldKeySource] = string(nodespec.FieldLiteral)
	row[nodespec.FieldKeyValue] = ""
	delete(row, nodespec.FieldKeyRef)
}

// rewriteDanglingTemplate rewrites a template's external {{id.path}} tokens
// to {{key.path}} — human-readable, and unresolvable on the target board, so
// the reference surfaces as invalid instead of silently binding to whatever
// node happens to share the id or position. Tokens that stay are spliced
// around, not re-rendered, so their spacing survives the trip.
func rewriteDanglingTemplate(
	row map[string]any,
	field nodespec.Field,
	nodeID string,
	keep map[string]bool,
	upstream map[string]string,
	idToKey map[string]string,
) {
	value := field.Value
	if value == "" {
		return
	}
	spans, err := binding.TemplateSpans(value)
	if err != nil {
		// A template Go cannot parse has no well-formed reference to dangle,
		// and refusing the export would be a new failure for input every
		// previous build accepted. §7 leaves Go's strictness to a later plan.
		return
	}
	var rewritten strings.Builder
	pos := 0
	dangled := false
	for _, span := range spans {
		if !span.IsRef {
			continue
		}
		key := danglingTarget(span.Ref, nodeID, keep, upstream, idToKey)
		if key == "" {
			continue
		}
		// The marker names the FIRST cut reference; a field with two is rare
		// and the importer shows one line either way.
		if !dangled {
			dangled = true
			row[nodespec.FieldKeyDangling] = map[string]any{
				nodespec.DanglingKeyOriginal: key,
				nodespec.DanglingKeyPath:     span.Ref.Path,
			}
		}
		rewritten.WriteString(value[pos:span.Start])
		rewritten.WriteString(binding.RefToken(key, span.Ref.Path))
		pos = span.End
	}
	if !dangled {
		return
	}
	rewritten.WriteString(value[pos:])
	row[nodespec.FieldKeyValue] = rewritten.String()
}

// deriveRequires collects the environment and credential names the exported
// nodes reference. Credentials carry their kind as a mapping hint when the
// project still knows the name; a dangling reference exports with no kind.
func deriveRequires(
	p *store.Project,
	nodes []store.BoardNode,
	specs map[string]nodespec.Spec,
) (Requires, error) {
	envs := map[string]bool{}
	creds := map[string]bool{}
	for _, n := range nodes {
		http := specs[n.ID].HTTP
		if http == nil {
			continue
		}
		if http.Environment != "" {
			envs[http.Environment] = true
		}
		if http.Credential != "" {
			creds[http.Credential] = true
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
func embedCollections(
	p *store.Project,
	nodes []store.BoardNode,
	specs map[string]nodespec.Spec,
) ([]store.Collection, error) {
	wanted := map[string]map[string]bool{} // collectionID -> requestIDs
	for _, n := range nodes {
		ref := specs[n.ID].RequestRef
		if ref == nil || ref.CollectionID == "" || ref.RequestID == "" {
			continue
		}
		if wanted[ref.CollectionID] == nil {
			wanted[ref.CollectionID] = map[string]bool{}
		}
		wanted[ref.CollectionID][ref.RequestID] = true
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
