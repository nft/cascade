package transform

import (
	"reflect"
	"strings"
	"testing"

	"cascade/core/binding"
)

func pickEnv() *binding.Env {
	return &binding.Env{
		Outputs: map[string]*binding.Output{
			"create-org": {
				Status: 201,
				Body: map[string]any{
					"name": "Apollo",
					"orgs": []any{
						map[string]any{"id": "o1"},
						map[string]any{"id": "o2"},
					},
				},
			},
		},
		Upstreams: []string{"create-org"},
	}
}

func TestPickReshapes(t *testing.T) {
	spec := Spec{Mode: ModePick, Pick: []PickRow{
		{Key: "orgIds", Source: binding.NewRef("create-org", "body.orgs[*].id")},
		{Key: "meta.label", Source: binding.Template("org {{res.name}}")},
		{Key: "meta.fixed", Source: binding.Literal(42)},
	}}
	out, err := Execute(spec, Input{Env: pickEnv()})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	want := map[string]any{
		"orgIds": []any{"o1", "o2"},
		"meta":   map[string]any{"label": "org Apollo", "fixed": float64(42)},
	}
	if !reflect.DeepEqual(out.Body, want) {
		t.Fatalf("got %#v, want %#v", out.Body, want)
	}
	if out.Status != 0 {
		t.Fatalf("synthetic output must have status 0, got %d", out.Status)
	}
}

func TestPickDefaultsWhenModeEmpty(t *testing.T) {
	spec := Spec{Pick: []PickRow{{Key: "n", Source: binding.NewRef("create-org", "body.name")}}}
	out, err := Execute(spec, Input{Env: pickEnv()})
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	if !reflect.DeepEqual(out.Body, map[string]any{"n": "Apollo"}) {
		t.Fatalf("got %#v", out.Body)
	}
}

func TestPickErrors(t *testing.T) {
	cases := []struct {
		name string
		spec Spec
		want string
	}{
		{"no rows", Spec{Mode: ModePick}, "at least one row"},
		{"empty key", Spec{Mode: ModePick, Pick: []PickRow{{Key: " ", Source: binding.Literal(1)}}}, "empty output key"},
		{"missing path", Spec{Mode: ModePick, Pick: []PickRow{{Key: "x", Source: binding.NewRef("create-org", "body.nope")}}}, `pick "x"`},
		{"bad mode", Spec{Mode: "yaml"}, "unknown mode"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Execute(c.spec, Input{Env: pickEnv()})
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want error containing %q, got %v", c.want, err)
			}
		})
	}
}
