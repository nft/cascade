package infer

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Regenerate goldens with: go test ./core/schema/infer -run TestGolden -update
var update = flag.Bool("update", false, "rewrite golden files")

func TestGolden(t *testing.T) {
	inputs, err := filepath.Glob(filepath.Join("testdata", "*.input.json"))
	if err != nil || len(inputs) == 0 {
		t.Fatalf("no golden inputs found: %v", err)
	}
	for _, input := range inputs {
		name := strings.TrimSuffix(filepath.Base(input), ".input.json")
		t.Run(name, func(t *testing.T) {
			raw, err := os.ReadFile(input)
			if err != nil {
				t.Fatal(err)
			}
			schema, err := InferJSON(raw)
			if err != nil {
				t.Fatalf("InferJSON: %v", err)
			}
			got, err := json.MarshalIndent(schema, "", "  ")
			if err != nil {
				t.Fatal(err)
			}
			got = append(got, '\n')
			goldenPath := filepath.Join("testdata", name+".golden.json")
			if *update {
				if err := os.WriteFile(goldenPath, got, 0o644); err != nil {
					t.Fatal(err)
				}
				return
			}
			want, err := os.ReadFile(goldenPath)
			if err != nil {
				t.Fatalf("missing golden (run with -update): %v", err)
			}
			if !bytes.Equal(got, want) {
				t.Fatalf("golden mismatch for %s\ngot:\n%s\nwant:\n%s", name, got, want)
			}
		})
	}
}

func TestDeterministicOutput(t *testing.T) {
	raw := []byte(`{"b": 1, "a": {"z": true, "y": "x"}, "c": [1, 2.5]}`)
	first, err := InferJSON(raw)
	if err != nil {
		t.Fatal(err)
	}
	a, _ := json.Marshal(first)
	for range 10 {
		s, _ := InferJSON(raw)
		b, _ := json.Marshal(s)
		if !bytes.Equal(a, b) {
			t.Fatalf("non-deterministic marshal:\n%s\n%s", a, b)
		}
	}
}

func TestDepthCap(t *testing.T) {
	// Build nesting deeper than MaxDepth; inference must terminate and emit
	// an untyped schema at the cap.
	var v any = "leaf"
	for range MaxDepth + 5 {
		v = map[string]any{"child": v}
	}
	s := Infer(v)
	depth := 0
	for s != nil && s.Properties != nil {
		s = s.Properties["child"]
		depth++
	}
	if depth > MaxDepth {
		t.Fatalf("schema depth %d exceeds cap %d", depth, MaxDepth)
	}
	if s == nil {
		t.Fatal("walk fell off the schema")
	}
}

func TestRoundTrip(t *testing.T) {
	schema, err := InferJSON([]byte(`{"id": "3f2a8c1e-1b2d-4e5f-8a9b-0c1d2e3f4a5b", "tags": ["a", null]}`))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := json.Marshal(schema)
	if err != nil {
		t.Fatal(err)
	}
	var back Schema
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	raw2, err := json.Marshal(back)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(raw, raw2) {
		t.Fatalf("round-trip changed schema:\n%s\n%s", raw, raw2)
	}
}
