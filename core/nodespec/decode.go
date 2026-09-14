package nodespec

import (
	"encoding/json"
	"fmt"
	"math"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/httpcall"
)

// Node-data keys, mirroring frontend/src/lib/model.ts (OperationNodeData,
// TransformNodeData, MockNodeData, DelayNodeData, ForNodeData). The frontend
// owns the format; these constants are the one Go-side transcription of it.
const (
	dataKeyKey        = "key"
	dataKeyExports    = "exports"
	dataKeyRequestRef = "requestRef"

	dataKeyProtocol    = "protocol"
	dataKeyMethod      = "method"
	dataKeyPath        = "path"
	dataKeyOrigin      = "origin"
	dataKeyEnvironment = "environment"
	dataKeyCredential  = "credential"
	dataKeyRawBody     = "rawBody"

	dataKeyMode   = "mode"
	dataKeyScript = "script"

	dataKeyBody       = "body"
	dataKeyStatusCode = "statusCode"

	dataKeyDurationMs = "durationMs"

	dataKeyCount  = "count"
	dataKeySource = "source"
)

// The exported keys are the ones a WRITER of the format needs. Decode is the
// only reader Go has, so everything else stays unexported; share/export.go
// rewrites bindings the selection cut and has to spell these back into the
// opaque map, and spelling them twice is how the two sides drift.
const (
	DataKeyFields = "fields"
	DataKeyPick   = "pick"

	FieldKeySource   = "source"
	FieldKeyValue    = "value"
	FieldKeyRef      = "ref"
	FieldKeyDangling = "dangling"

	DanglingKeyOriginal = "originalKey"
	DanglingKeyPath     = "path"
)

// Row keys of the nested objects node data carries.
const (
	fieldKeyKey = "key"

	refKeyNodeID = "nodeId"
	refKeyPath   = "path"

	exportKeyKey  = "key"
	exportKeyPath = "path"

	rawBodyKeyContentType = "contentType"
	rawBodyKeyText        = "text"

	requestRefKeyCollection = "collectionId"
	requestRefKeyRequest    = "requestId"
)

// Decode reads one node's opaque data map. Decoding is TOTAL: a garbage
// durationMs decodes to 0 and fails the delay's range check at dispatch, an
// unparseable mock body stays text and fails at dispatch, an unknown loop
// mode fails at dispatch. Only a structurally impossible document errors
// here, so one bad node never blocks a whole run from starting.
//
// It mirrors board.ts's type guards but deliberately does not apply their
// display degradations: an unknown method decodes verbatim rather than
// becoming GET, because silently GETting a POST node is a data-integrity
// hazard. Validate flags it and dispatch fails it.
//
// A zero type means http, matching core.Node.EffectiveType — nodes predate
// the type discriminator.
func Decode(t core.NodeType, data map[string]any) (Spec, error) {
	kind := t
	if kind == "" {
		kind = core.NodeTypeHTTP
	}
	if kind == core.NodeTypeNote {
		// A note is a canvas annotation: no key, no exports, nothing to run.
		return Spec{Kind: kind}, nil
	}
	spec := Spec{
		Kind:       kind,
		Key:        stringAt(data, dataKeyKey),
		Exports:    decodeExports(data),
		RequestRef: decodeRequestRef(data),
	}
	switch kind {
	case core.NodeTypeHTTP:
		spec.HTTP = &HTTPSpec{
			Protocol:    stringAt(data, dataKeyProtocol),
			Method:      stringAt(data, dataKeyMethod),
			Path:        stringAt(data, dataKeyPath),
			Origin:      stringAt(data, dataKeyOrigin),
			Environment: stringAt(data, dataKeyEnvironment),
			Credential:  stringAt(data, dataKeyCredential),
			Fields:      decodeFields(data, DataKeyFields),
			RawBody:     decodeRawBody(data),
		}
	case core.NodeTypeTransform:
		spec.Transform = &TransformSpec{
			Mode:   stringAt(data, dataKeyMode),
			Pick:   decodeFields(data, DataKeyPick),
			Script: stringAt(data, dataKeyScript),
		}
	case core.NodeTypeMock:
		spec.Mock = &MockSpec{
			Body:   stringAt(data, dataKeyBody),
			Status: intAt(data, dataKeyStatusCode),
		}
	case core.NodeTypeDelay:
		spec.Delay = &DelaySpec{DurationMs: intAt(data, dataKeyDurationMs)}
	case core.NodeTypeFor:
		spec.Loop = &LoopSpec{
			Mode:   stringAt(data, dataKeyMode),
			Count:  intAt(data, dataKeyCount),
			Source: decodeRef(mapAt(data, dataKeySource)),
		}
	default:
		return Spec{}, fmt.Errorf("nodespec: unknown node type %q", t)
	}
	return spec, nil
}

func decodeFields(data map[string]any, key string) []Field {
	rows := Rows(data, key)
	if len(rows) == 0 {
		return nil
	}
	out := make([]Field, 0, len(rows))
	for _, row := range rows {
		field := Field{
			Key:    stringAt(row, fieldKeyKey),
			Source: FieldSource(stringAt(row, FieldKeySource)),
			Value:  stringAt(row, FieldKeyValue),
			Ref:    decodeRef(mapAt(row, FieldKeyRef)),
		}
		if d := mapAt(row, FieldKeyDangling); d != nil {
			field.Dangling = &Dangling{
				OriginalKey: stringAt(d, DanglingKeyOriginal),
				Path:        stringAt(d, DanglingKeyPath),
			}
		}
		out = append(out, field)
	}
	return out
}

func decodeRef(row map[string]any) *Ref {
	if row == nil {
		return nil
	}
	return &Ref{NodeID: stringAt(row, refKeyNodeID), Path: stringAt(row, refKeyPath)}
}

func decodeExports(data map[string]any) []binding.Export {
	rows := Rows(data, dataKeyExports)
	if len(rows) == 0 {
		return nil
	}
	out := make([]binding.Export, 0, len(rows))
	for _, row := range rows {
		out = append(out, binding.Export{
			Key:  stringAt(row, exportKeyKey),
			Path: stringAt(row, exportKeyPath),
		})
	}
	return out
}

// decodeRawBody keeps an empty raw body as a non-nil pointer: its presence is
// the editor's raw-mode switch (RequestSection.svelte reads `rawBody !==
// undefined`), so dropping an empty one would flip the node back to
// field mode at run time.
func decodeRawBody(data map[string]any) *httpcall.RawBody {
	row := mapAt(data, dataKeyRawBody)
	if row == nil {
		return nil
	}
	return &httpcall.RawBody{
		ContentType: stringAt(row, rawBodyKeyContentType),
		Text:        stringAt(row, rawBodyKeyText),
	}
}

func decodeRequestRef(data map[string]any) *RequestRef {
	row := mapAt(data, dataKeyRequestRef)
	if row == nil {
		return nil
	}
	return &RequestRef{
		CollectionID: stringAt(row, requestRefKeyCollection),
		RequestID:    stringAt(row, requestRefKeyRequest),
	}
}

func stringAt(data map[string]any, key string) string {
	s, _ := data[key].(string)
	return s
}

// intAt reads a JSON number tolerantly. Boards decode into float64, but data
// that has been round-tripped through a typed path can arrive as an int or a
// json.Number. Anything else — including a numeric string, NaN, and values
// too large to be a count or a duration — reads as 0 and fails its range
// check at dispatch.
func intAt(data map[string]any, key string) int {
	switch v := data[key].(type) {
	case float64:
		if math.IsNaN(v) || v > math.MaxInt32 || v < math.MinInt32 {
			return 0
		}
		return int(v)
	case int:
		return v
	case int64:
		return int(v)
	case json.Number:
		n, err := v.Int64()
		if err != nil {
			return 0
		}
		return int(n)
	}
	return 0
}

func mapAt(data map[string]any, key string) map[string]any {
	m, _ := data[key].(map[string]any)
	return m
}

// Rows returns the object entries of a list-valued key ("fields" on http
// nodes, "pick" on transforms); non-object entries are skipped rather than
// erroring, so one malformed row never costs the rest.
//
// Exported because Decode reads its fields through it: Rows(data, key)[i] is
// the live map that produced Fields[i], so a caller holding a decoded Field
// can mutate the row it came from without a parallel skip rule of its own.
func Rows(data map[string]any, key string) []map[string]any {
	list, _ := data[key].([]any)
	rows := make([]map[string]any, 0, len(list))
	for _, item := range list {
		if row, ok := item.(map[string]any); ok {
			rows = append(rows, row)
		}
	}
	return rows
}
