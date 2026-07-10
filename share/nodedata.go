package share

import (
	"encoding/json"
	"fmt"
	"regexp"
)

// The store carries node data opaquely; the exporter is the one Go-side
// consumer that must interpret the frontend's serialized shape. These keys
// mirror frontend/src/lib/model.ts (OperationNodeData, TransformNodeData,
// NodeField) — the single source of truth for the format.
const (
	dataKeyKey         = "key"
	dataKeyStatus      = "status"
	dataKeyNote        = "note"
	dataKeyEnvironment = "environment"
	dataKeyCredential  = "credential"
	dataKeyFields      = "fields"
	dataKeyPick        = "pick"
	dataKeyRequestRef  = "requestRef"

	fieldKeySource   = "source"
	fieldKeyValue    = "value"
	fieldKeyRef      = "ref"
	fieldKeyDangling = "dangling"

	refKeyNodeID = "nodeId"
	refKeyPath   = "path"

	requestRefKeyCollection = "collectionId"
	requestRefKeyRequest    = "requestId"

	sourceLiteral  = "literal"
	sourceBinding  = "binding"
	sourceTemplate = "template"

	statusIdle = "idle"
)

// danglingKeyOriginal names the upstream a dangling field was bound to; the
// importer renders it as "was bound to <originalKey>.<path>" (plan 07).
const (
	danglingKeyOriginal = "originalKey"
	danglingKeyPath     = "path"
)

// templateRefPattern matches {{…}} interpolation tokens in template fields.
var templateRefPattern = regexp.MustCompile(`\{\{\s*([^{}]+?)\s*\}\}`)

// fanOutIndexToken is the {{i}} iteration index — not a node reference.
const fanOutIndexToken = "i"

// resToken is the "my single direct upstream" sugar; which node it means is
// carried by the edge, not the token.
const resToken = "res"

// deepCopyData clones node data via a JSON round-trip, so exports never
// mutate the caller's board.
func deepCopyData(data map[string]any) (map[string]any, error) {
	if data == nil {
		return nil, nil
	}
	raw, err := json.Marshal(data)
	if err != nil {
		return nil, fmt.Errorf("copy node data: %w", err)
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("copy node data: %w", err)
	}
	return out, nil
}

func dataString(data map[string]any, key string) string {
	s, _ := data[key].(string)
	return s
}

// fieldRows returns the mutable row maps under a field-list key ("fields" on
// http nodes, "pick" on transforms); non-map entries are skipped.
func fieldRows(data map[string]any, key string) []map[string]any {
	list, _ := data[key].([]any)
	rows := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if row, ok := item.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}

// refTarget reads a binding row's structured upstream reference. ok is false
// when the row has no ref at all.
func refTarget(row map[string]any) (nodeID, path string, ok bool) {
	ref, isMap := row[fieldKeyRef].(map[string]any)
	if !isMap {
		return "", "", false
	}
	return dataString(ref, refKeyNodeID), dataString(ref, refKeyPath), true
}

// requestRef reads a node's collection provenance link, if any.
func requestRef(data map[string]any) (collectionID, requestID string, ok bool) {
	ref, isMap := data[dataKeyRequestRef].(map[string]any)
	if !isMap {
		return "", "", false
	}
	return dataString(ref, requestRefKeyCollection), dataString(ref, requestRefKeyRequest), true
}
