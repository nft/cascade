package share

import (
	"encoding/json"
	"fmt"
)

// core/nodespec owns the node-data format: Decode reads it and its exported
// key constants (DataKey*, FieldKey*, DanglingKey*, RefKey*, RawBodyKey*)
// spell the keys a writer needs. Only run state lives here, because it is not configuration and
// nodespec deliberately does not model it — an exported node must arrive idle.
const (
	dataKeyStatus = "status"
	dataKeyNote   = "note"
	statusIdle    = "idle"
)

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
