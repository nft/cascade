package binding

import (
	"encoding/json"
	"math"
	"net/http"
	"os"
	"strings"
	"testing"
)

// vectorsPath is the hand-authored cross-language contract,
// read verbatim by frontend/src/lib/refs.test.ts as well. A case that only
// passes here has not proved anything the file exists for.
const vectorsPath = "../testdata/binding_vectors.json"

type vectorFile struct {
	Index     int                      `json:"index"`
	Upstreams []string                 `json:"upstreams"`
	Exports   map[string][]Export      `json:"exports"`
	Outputs   map[string]*vectorOutput `json:"outputs"`
	Cases     []vectorCase             `json:"cases"`
}

// vectorOutput mirrors the frontend's CapturedResponse, so headers arrive as
// a flat map and become an http.Header here.
type vectorOutput struct {
	Status    int               `json:"status"`
	Headers   map[string]string `json:"headers"`
	Body      any               `json:"body"`
	Truncated bool              `json:"truncated"`
}

type vectorCase struct {
	Name string `json:"name"`
	// Exactly one of Template or Ref is set; presence is the discriminator.
	Template *string `json:"template"`
	Ref      *Ref    `json:"ref"`
	// Upstreams overrides the file-level upstreams for res-sugar cases.
	Upstreams []string `json:"upstreams"`
	Expect    *string  `json:"expect"`
	Type      string   `json:"type"`
	Error     string   `json:"error"`
}

func (o *vectorOutput) output() *Output {
	header := make(http.Header, len(o.Headers))
	for name, value := range o.Headers {
		header.Set(name, value)
	}
	return &Output{Status: o.Status, Header: header, Body: o.Body, Truncated: o.Truncated}
}

func (c vectorCase) source(t *testing.T) Source {
	t.Helper()
	switch {
	case c.Template != nil:
		return Template(*c.Template)
	case c.Ref != nil:
		return NewRef(c.Ref.Node, c.Ref.Path)
	}
	t.Fatalf("vector %q sets neither template nor ref", c.Name)
	return Source{}
}

func loadVectors(t *testing.T) *vectorFile {
	t.Helper()
	raw, err := os.ReadFile(vectorsPath)
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if len(vf.Cases) == 0 {
		t.Fatal("vector file has no cases")
	}
	return &vf
}

func TestBindingVectors(t *testing.T) {
	vf := loadVectors(t)
	outputs := make(map[string]*Output, len(vf.Outputs))
	for id, out := range vf.Outputs {
		outputs[id] = out.output()
	}
	for _, tc := range vf.Cases {
		t.Run(tc.Name, func(t *testing.T) {
			env := &Env{
				Outputs:   outputs,
				Exports:   vf.Exports,
				Upstreams: vf.Upstreams,
				Index:     vf.Index,
			}
			if tc.Upstreams != nil {
				env.Upstreams = tc.Upstreams
			}
			got, err := tc.source(t).Resolve(env)
			if tc.Error != "" {
				if err == nil || !strings.Contains(err.Error(), tc.Error) {
					t.Fatalf("want an error containing %q, got %v", tc.Error, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("resolve: %v", err)
			}
			if tc.Type != "" {
				if name := jsonTypeName(got); name != tc.Type {
					t.Fatalf("JSON type %q, want %q", name, tc.Type)
				}
			}
			if tc.Expect == nil {
				t.Fatal("vector sets neither expect nor error")
			}
			s, err := Stringify(got)
			if err != nil {
				t.Fatalf("Stringify: %v", err)
			}
			if s != *tc.Expect {
				t.Fatalf("Stringify = %q, want %q", s, *tc.Expect)
			}
		})
	}
}

// TestStringifyNonJSONValues covers the scalar kinds the vectors cannot carry:
// JSON numbers always decode to float64, and non-finite floats have no JSON
// literal at all.
func TestStringifyNonJSONValues(t *testing.T) {
	cases := []struct {
		value any
		want  string
	}{
		{int(7), "7"},
		{int64(-9007199254740993), "-9007199254740993"},
		{true, "true"},
		{nil, "null"},
		{"raw <text> & more", "raw <text> & more"},
	}
	for _, tc := range cases {
		got, err := Stringify(tc.value)
		if err != nil {
			t.Fatalf("Stringify(%#v): %v", tc.value, err)
		}
		if got != tc.want {
			t.Fatalf("Stringify(%#v) = %q, want %q", tc.value, got, tc.want)
		}
	}

	// Non-finite floats have no JSON literal, so they render as scalars the
	// way JS String() does but must still be rejected inside a composite
	// rather than emitted as an invalid document.
	nonFinite := map[string]float64{"NaN": math.NaN(), "Infinity": math.Inf(1), "-Infinity": math.Inf(-1)}
	for want, v := range nonFinite {
		got, err := Stringify(v)
		if err != nil || got != want {
			t.Fatalf("Stringify(%v) = %q, %v; want %q", v, got, err, want)
		}
		if _, err := Stringify(map[string]any{"n": v}); err == nil {
			t.Fatalf("%v inside a composite should fail to encode", v)
		}
	}
}

// TestPathNotFoundEmptyPathReads checks the whole-output reference ({{res}}),
// where "path not found" would be nonsense: the output is there, it just
// cannot be read. This message reaches users as a node note and a log row.
func TestPathNotFoundEmptyPathReads(t *testing.T) {
	whole := (&PathNotFoundError{Node: "createUser", Path: "", Hint: hintTruncated}).Error()
	want := `binding: cannot read the output of node "createUser" (the response was too large to capture)`
	if whole != want {
		t.Errorf("whole-output error\n got %s\nwant %s", whole, want)
	}
	if strings.Contains(whole, `path ""`) {
		t.Errorf("empty path leaked into the message: %s", whole)
	}
	deep := (&PathNotFoundError{Node: "createUser", Path: "body.id", Hint: "no such key"}).Error()
	wantDeep := `binding: path "body.id" not found in output of node "createUser" (no such key)`
	if deep != wantDeep {
		t.Errorf("path error changed shape\n got %s\nwant %s", deep, wantDeep)
	}
}
