package nodespec

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"cascade/core"
	"cascade/core/binding"
	"cascade/core/httpcall"
)

// boardFixture is the slice of the board format this package cares about.
// nodespec must not import cascade/store, so the golden file is read through
// a local shape — which also proves Decode needs nothing but the opaque map.
type boardFixture struct {
	Nodes []struct {
		ID   string         `json:"id"`
		Type core.NodeType  `json:"type"`
		Data map[string]any `json:"data"`
	} `json:"nodes"`
}

func loadBoard(t *testing.T) map[string]Spec {
	t.Helper()
	raw, err := os.ReadFile("testdata/board_full.json")
	if err != nil {
		t.Fatalf("read fixture: %v", err)
	}
	var board boardFixture
	if err := json.Unmarshal(raw, &board); err != nil {
		t.Fatalf("parse fixture: %v", err)
	}
	specs := make(map[string]Spec, len(board.Nodes))
	for _, n := range board.Nodes {
		spec, err := Decode(n.Type, n.Data)
		if err != nil {
			t.Fatalf("decode %q: %v", n.ID, err)
		}
		specs[n.ID] = spec
	}
	return specs
}

func TestDecodeGoldenBoard(t *testing.T) {
	specs := loadBoard(t)
	want := map[string]Spec{
		// repeat:3 is a key no current node type declares — a leftover in real
		// saved boards, and proof that unknown keys are ignored.
		"create-org": {
			Kind:    core.NodeTypeHTTP,
			Key:     "createOrg",
			Exports: []binding.Export{{Key: "orgId", Path: "body.id"}},
			HTTP: &HTTPSpec{
				Method:      "POST",
				Path:        "/v1/orgs",
				Environment: "staging",
				Credential:  "staging-admin",
				Fields:      []Field{{Key: "body.name", Source: FieldLiteral, Value: "Acme"}},
			},
		},
		"create-user": {
			Kind: core.NodeTypeHTTP,
			Key:  "createUser",
			Exports: []binding.Export{
				{Key: "userId", Path: "body.id"},
				{Key: "location", Path: "headers.Location"},
			},
			RequestRef: &RequestRef{CollectionID: "internal-apis", RequestID: "create-user"},
			HTTP: &HTTPSpec{
				Method:      "POST",
				Path:        "/v1/orgs/{orgId}/users",
				Environment: "staging",
				Credential:  "staging-admin",
				Fields: []Field{
					{
						Key: "path.orgId", Source: FieldBinding, Value: "create-org.body.id",
						Ref: &Ref{NodeID: "create-org", Path: "body.id"},
					},
					{Key: "query.expand", Source: FieldLiteral, Value: "profile"},
					{Key: "header.X-Request-Id", Source: FieldTemplate, Value: "req-{{i}}-{{res.body.id}}"},
					{Key: "body.user.name", Source: FieldLiteral, Value: "Ada"},
					{
						Key: "body.user.orgId", Source: FieldBinding, Value: "res.body.id",
						Ref: &Ref{NodeID: "", Path: "body.id"},
					},
					{
						Key: "body.plan", Source: FieldLiteral, Value: "",
						Dangling: &Dangling{OriginalKey: "pickPlan", Path: "body.plan"},
					},
				},
			},
		},
		"send-raw": {
			Kind: core.NodeTypeHTTP,
			Key:  "notify",
			HTTP: &HTTPSpec{
				Method:  "POST",
				Path:    "/hooks/user-created",
				Origin:  "https://hooks.example.com",
				RawBody: &httpcall.RawBody{ContentType: "application/json", Text: "{{create-user.body}}"},
			},
		},
		"reshape": {
			Kind: core.NodeTypeTransform,
			Key:  "reshape",
			Transform: &TransformSpec{
				Mode: "pick",
				Pick: []Field{
					{Key: "user.id", Source: FieldBinding, Value: "res.body.id", Ref: &Ref{Path: "body.id"}},
					{Key: "user.tier", Source: FieldLiteral, Value: "free"},
				},
			},
		},
		"script-step": {
			Kind:      core.NodeTypeTransform,
			Key:       "summarize",
			Transform: &TransformSpec{Mode: "script", Script: "return res.body.users.length"},
		},
		"fixture": {
			Kind: core.NodeTypeMock,
			Key:  "fixture",
			Mock: &MockSpec{Body: `{"tags":["a","b"]}`, Status: 201},
		},
		"hold": {
			Kind:  core.NodeTypeDelay,
			Key:   "hold",
			Delay: &DelaySpec{DurationMs: 1500},
		},
		"loop": {
			Kind: core.NodeTypeFor,
			Key:  "eachTag",
			Loop: &LoopSpec{Mode: LoopModeEach, Count: 3, Source: &Ref{NodeID: "fixture", Path: "body.tags"}},
		},
		"loop-child": {
			Kind: core.NodeTypeHTTP,
			Key:  "tagUser",
			HTTP: &HTTPSpec{
				Method:      "PUT",
				Path:        "/v1/users/{id}/tags",
				Environment: "staging",
				Credential:  "staging-admin",
				Fields: []Field{
					{
						Key: "path.id", Source: FieldBinding, Value: "create-user.body.id",
						Ref: &Ref{NodeID: "create-user", Path: "body.id"},
					},
					{Key: "body.tag", Source: FieldTemplate, Value: "{{item}}-{{i}}"},
				},
			},
		},
		// A note carries no key and nothing runnable, even though the fixture
		// gives it a name and text.
		"sticky": {Kind: core.NodeTypeNote},
	}
	if len(specs) != len(want) {
		t.Fatalf("decoded %d nodes, want %d", len(specs), len(want))
	}
	for id, expected := range want {
		got, ok := specs[id]
		if !ok {
			t.Fatalf("node %q missing from fixture", id)
		}
		if !reflect.DeepEqual(got, expected) {
			t.Errorf("node %q:\n got %+v\nwant %+v", id, got, expected)
		}
	}
}

func TestDecodeGoldenSections(t *testing.T) {
	spec := loadBoard(t)["create-user"]
	want := []struct {
		section Section
		name    string
	}{
		{SectionPath, "orgId"},
		{SectionQuery, "expand"},
		{SectionHeader, "X-Request-Id"},
		{SectionBody, "user.name"},
		{SectionBody, "user.orgId"},
		{SectionBody, "plan"},
	}
	for i, f := range spec.HTTP.Fields {
		section, name, err := f.Section()
		if err != nil {
			t.Fatalf("field %q: %v", f.Key, err)
		}
		if section != want[i].section || name != want[i].name {
			t.Errorf("field %q: got (%q, %q), want (%q, %q)", f.Key, section, name, want[i].section, want[i].name)
		}
	}
}

func TestDecodeGoldenSources(t *testing.T) {
	specs := loadBoard(t)
	fields := specs["create-user"].HTTP.Fields
	cases := []struct {
		field Field
		want  binding.Source
	}{
		{fields[0], binding.NewRef("create-org", "body.id")},
		{fields[1], binding.Literal("profile")},
		{fields[2], binding.Template("req-{{i}}-{{res.body.id}}")},
		// The empty nodeId is the res sugar: it stays empty, and the edge
		// decides which node it means.
		{fields[4], binding.NewRef("", "body.id")},
	}
	for _, tc := range cases {
		got, err := tc.field.BindingSource()
		if err != nil {
			t.Fatalf("field %q: %v", tc.field.Key, err)
		}
		if !reflect.DeepEqual(got, tc.want) {
			t.Errorf("field %q: got %+v, want %+v", tc.field.Key, got, tc.want)
		}
	}
}

func TestDecodeGoldenLoopSourceRef(t *testing.T) {
	loop := loadBoard(t)["loop"].Loop
	if got, want := loop.SourceRef(), (binding.Ref{Node: "fixture", Path: "body.tags"}); got != want {
		t.Errorf("SourceRef() = %+v, want %+v", got, want)
	}
	if got := (LoopSpec{Mode: LoopModeEach}).SourceRef(); got != (binding.Ref{}) {
		t.Errorf("nil source: got %+v, want the zero ref (res sugar)", got)
	}
}

// The mock body stays text through Decode: parsing is deferred to dispatch so
// a typo fails only that node.
func TestDecodeMockBodyStaysText(t *testing.T) {
	spec, err := Decode(core.NodeTypeMock, map[string]any{"body": "{not json", "statusCode": float64(500)})
	if err != nil {
		t.Fatalf("Decode: %v", err)
	}
	if spec.Mock.Body != "{not json" {
		t.Errorf("Body = %q, want the authored text verbatim", spec.Mock.Body)
	}
	if err := spec.Validate(); err == nil {
		t.Error("Validate() = nil, want a parse failure")
	}
}

func TestDecodeIsTotal(t *testing.T) {
	t.Run("nil data", func(t *testing.T) {
		spec, err := Decode(core.NodeTypeHTTP, nil)
		if err != nil {
			t.Fatalf("Decode: %v", err)
		}
		if !reflect.DeepEqual(spec, Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{}}) {
			t.Errorf("got %+v, want an empty http spec", spec)
		}
	})
	t.Run("garbage durationMs decodes to zero", func(t *testing.T) {
		for _, bad := range []any{"soon", true, nil, []any{1}, 1e30} {
			spec, err := Decode(core.NodeTypeDelay, map[string]any{"durationMs": bad})
			if err != nil {
				t.Fatalf("Decode(%v): %v", bad, err)
			}
			if spec.Delay.DurationMs != 0 {
				t.Errorf("durationMs %v decoded to %d, want 0", bad, spec.Delay.DurationMs)
			}
			// It fails its range check, which is the point: the run starts and
			// only this node fails.
			if err := spec.Validate(); err == nil {
				t.Errorf("durationMs %v: Validate() = nil, want a range failure", bad)
			}
		}
	})
	t.Run("non-object field rows are skipped", func(t *testing.T) {
		spec, err := Decode(core.NodeTypeHTTP, map[string]any{
			"fields": []any{"junk", map[string]any{"key": "query.a", "source": "literal", "value": "1"}, 42},
		})
		if err != nil {
			t.Fatalf("Decode: %v", err)
		}
		want := []Field{{Key: "query.a", Source: FieldLiteral, Value: "1"}}
		if !reflect.DeepEqual(spec.HTTP.Fields, want) {
			t.Errorf("Fields = %+v, want %+v", spec.HTTP.Fields, want)
		}
	})
	t.Run("wrongly typed values read as zero", func(t *testing.T) {
		spec, err := Decode(core.NodeTypeHTTP, map[string]any{
			"method": 7, "path": nil, "fields": map[string]any{}, "rawBody": "text",
		})
		if err != nil {
			t.Fatalf("Decode: %v", err)
		}
		if !reflect.DeepEqual(spec.HTTP, &HTTPSpec{}) {
			t.Errorf("got %+v, want an empty http spec", spec.HTTP)
		}
	})
	t.Run("an unknown method is not degraded to GET", func(t *testing.T) {
		spec, err := Decode(core.NodeTypeHTTP, map[string]any{"method": "FETCH"})
		if err != nil {
			t.Fatalf("Decode: %v", err)
		}
		if spec.HTTP.Method != "FETCH" {
			t.Errorf("Method = %q, want it verbatim", spec.HTTP.Method)
		}
		if err := spec.Validate(); err == nil {
			t.Error("Validate() = nil, want an unsupported-method failure")
		}
	})
	t.Run("an empty type is http", func(t *testing.T) {
		spec, err := Decode("", map[string]any{"method": "GET"})
		if err != nil {
			t.Fatalf("Decode: %v", err)
		}
		if spec.Kind != core.NodeTypeHTTP || spec.HTTP == nil {
			t.Errorf("got kind %q / %v, want an http spec", spec.Kind, spec.HTTP)
		}
	})
	t.Run("an unknown type errors", func(t *testing.T) {
		if _, err := Decode("condition", nil); err == nil {
			t.Error("Decode() = nil, want an unknown-type error")
		}
	})
	t.Run("an empty raw body stays non-nil", func(t *testing.T) {
		spec, err := Decode(core.NodeTypeHTTP, map[string]any{
			"rawBody": map[string]any{"contentType": "application/json", "text": ""},
		})
		if err != nil {
			t.Fatalf("Decode: %v", err)
		}
		if spec.HTTP.RawBody == nil {
			t.Fatal("RawBody = nil; its presence is the editor's raw-mode switch")
		}
	})
}

func TestSpecRefs(t *testing.T) {
	specs := loadBoard(t)
	cases := []struct {
		node string
		want []binding.Ref
	}{{
		// Ordered by field, then the raw body; {{i}} is a loop-scope value,
		// not a node reference, so it never appears.
		node: "create-user",
		want: []binding.Ref{
			{Node: "create-org", Path: "body.id"},
			{Path: "body.id"},
			{Path: "body.id"},
		},
	}, {
		node: "send-raw",
		want: []binding.Ref{{Node: "create-user", Path: "body"}},
	}, {
		node: "reshape",
		want: []binding.Ref{{Path: "body.id"}},
	}, {
		// {{item}} is loop scope too.
		node: "loop-child",
		want: []binding.Ref{{Node: "create-user", Path: "body.id"}},
	}, {
		node: "loop",
		want: []binding.Ref{{Node: "fixture", Path: "body.tags"}},
	}, {
		node: "fixture",
		want: nil,
	}, {
		node: "sticky",
		want: nil,
	}}
	for _, tc := range cases {
		t.Run(tc.node, func(t *testing.T) {
			got, err := specs[tc.node].Refs()
			if err != nil {
				t.Fatalf("Refs: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("got %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestTransformSpecEngine(t *testing.T) {
	spec, err := loadBoard(t)["reshape"].Transform.Engine()
	if err != nil {
		t.Fatalf("Engine: %v", err)
	}
	if spec.Mode != "pick" || len(spec.Pick) != 2 {
		t.Fatalf("got %+v, want two pick rows in pick mode", spec)
	}
	if spec.Pick[0].Key != "user.id" || spec.Pick[0].Source.Kind != binding.KindRef {
		t.Errorf("row 0 = %+v, want a ref row keyed user.id", spec.Pick[0])
	}
	if spec.Pick[1].Source.Literal != "free" {
		t.Errorf("row 1 = %+v, want the literal 'free'", spec.Pick[1])
	}
}
