// Package transform executes transform nodes: pure data steps that
// reshape upstream outputs without making a request. A transform produces a
// synthetic binding.Output (Status 0, Body = result) so the entire
// binding/export/picker machinery treats it exactly like an http node.
//
// Two modes: Pick (declarative rows over the binding path resolver, with the
// [*] array-map extension) and Script (sandboxed JavaScript via goja).
package transform

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"cascade/core/binding"
)

// Mode discriminates how a transform computes its output.
type Mode string

const (
	// ModePick is the declarative default: output-key ← expression rows.
	ModePick Mode = "pick"
	// ModeScript is the sandboxed-JavaScript escape hatch.
	ModeScript Mode = "script"
)

const (
	// DefaultTimeout is the script wall-clock limit when Input.Timeout is zero.
	DefaultTimeout = time.Second
	// MaxOutputBytes caps the JSON size of a transform's result body.
	MaxOutputBytes = 1 << 20
)

// PickRow is one output-key ← expression row of Pick mode. Key is a dot path
// inside the result body ("email", "user.id"); Source is resolved exactly
// like an http node's input field (ref, template, or literal).
type PickRow struct {
	Key    string         `json:"key"`
	Source binding.Source `json:"source"`
}

// Spec is a transform node's configuration.
type Spec struct {
	Mode   Mode      `json:"mode"`
	Pick   []PickRow `json:"pick,omitempty"`
	Script string    `json:"script,omitempty"`
}

// Input is everything one transform execution reads.
type Input struct {
	// Env resolves Pick rows (ID-based refs, same as http node fields).
	Env *binding.Env
	// Nodes holds ancestor outputs by node *key* for script mode
	// (`nodes.createOrg.body…`). Keys are a UI concept the engine otherwise
	// avoids, so the caller supplies the mapping.
	Nodes map[string]*binding.Output
	// Res is the single direct upstream's output; nil unless there is
	// exactly one.
	Res *binding.Output
	// Index is the fan-out iteration index ({{i}} in rows, `i` in scripts).
	Index int
	// Item is the current each-mode loop element, exposed as
	// `item` in scripts when HasItem is set; pick rows read it through
	// Env ({{item}}).
	Item    any
	HasItem bool
	// Timeout bounds script wall time; zero means DefaultTimeout.
	Timeout time.Duration
}

// Execute runs the transform and wraps its result as a synthetic output.
// An empty mode means Pick (the default mode, mirroring how an absent node
// type means http).
func Execute(spec Spec, in Input) (*binding.Output, error) {
	var body any
	var err error
	switch spec.Mode {
	case ModePick, "":
		body, err = executePick(spec.Pick, in.Env)
	case ModeScript:
		body, err = executeScript(spec.Script, in)
	default:
		return nil, fmt.Errorf("transform: unknown mode %q", spec.Mode)
	}
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(body)
	if err != nil {
		// Pick rows resolve captured JSON, so only scripts can get here.
		return nil, fmt.Errorf("transform: script must return a JSON-serializable value: %v", err)
	}
	if len(raw) > MaxOutputBytes {
		return nil, fmt.Errorf("transform: result of %d bytes exceeds the %d byte cap", len(raw), MaxOutputBytes)
	}
	// Round-trip normalizes script values (goja exports int64s etc.) to the
	// same shapes captured HTTP bodies have, so path resolution downstream
	// sees one representation.
	var normalized any
	if err := json.Unmarshal(raw, &normalized); err != nil {
		return nil, fmt.Errorf("transform: normalize result: %v", err)
	}
	return &binding.Output{Body: normalized}, nil
}

func executePick(rows []PickRow, env *binding.Env) (any, error) {
	if len(rows) == 0 {
		return nil, fmt.Errorf("transform: pick mode needs at least one row")
	}
	result := make(map[string]any)
	for _, row := range rows {
		key := strings.TrimSpace(row.Key)
		if key == "" {
			return nil, fmt.Errorf("transform: pick row with empty output key")
		}
		value, err := row.Source.Resolve(env)
		if err != nil {
			return nil, fmt.Errorf("transform: pick %q: %w", key, err)
		}
		SetKeyPath(result, key, value)
	}
	return result, nil
}

// SetKeyPath writes value at a dot path inside target, creating intermediate
// objects ("user.id" → {"user": {"id": …}}). A non-object on the way is
// replaced — later writes win, same as the sim's body builder. Exported so a
// request body's nested keys ("body.user.name") nest through the same code
// path as pick rows.
func SetKeyPath(target map[string]any, path string, value any) {
	segs := strings.Split(path, ".")
	current := target
	for _, seg := range segs[:len(segs)-1] {
		next, ok := current[seg].(map[string]any)
		if !ok {
			next = make(map[string]any)
			current[seg] = next
		}
		current = next
	}
	current[segs[len(segs)-1]] = value
}
