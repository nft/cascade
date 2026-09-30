package transform

import (
	"net/http"
	"reflect"
	"strings"
	"testing"
	"time"

	"cascade/core/binding"
)

func scriptInput() Input {
	return Input{
		Nodes: map[string]*binding.Output{
			"createOrg": {
				Status: 201,
				Header: http.Header{"Content-Type": []string{"application/json"}},
				Body: map[string]any{
					"members": []any{
						map[string]any{"email": "a@x.io", "active": true},
						map[string]any{"email": "b@x.io", "active": false},
						map[string]any{"email": "c@x.io", "active": true},
					},
				},
			},
		},
		Res: &binding.Output{Status: 200, Body: map[string]any{"name": "Apollo"}},
	}
}

func runScript(t *testing.T, script string, in Input) any {
	t.Helper()
	out, err := Execute(Spec{Mode: ModeScript, Script: script}, in)
	if err != nil {
		t.Fatalf("script: %v", err)
	}
	return out.Body
}

func TestScriptFiltersUpstream(t *testing.T) {
	script := `
		const members = nodes.createOrg.body.members.filter(m => m.active)
		return { count: members.length, emails: members.map(m => m.email) }`
	got := runScript(t, script, scriptInput())
	want := map[string]any{"count": float64(2), "emails": []any{"a@x.io", "c@x.io"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestScriptSeesResAndIndex(t *testing.T) {
	in := scriptInput()
	in.Index = 3
	got := runScript(t, `return res.body.name + "-" + i + "-" + res.status`, in)
	if got != "Apollo-3-200" {
		t.Fatalf("got %#v", got)
	}
}

// An infinite loop fails the node in ~1s instead of hanging the run.
func TestScriptInfiniteLoopInterrupted(t *testing.T) {
	start := time.Now()
	_, err := Execute(Spec{Mode: ModeScript, Script: `while (true) {}`}, scriptInput())
	elapsed := time.Since(start)
	if err == nil || !strings.Contains(err.Error(), "time limit") {
		t.Fatalf("want time-limit error, got %v", err)
	}
	if elapsed > 3*time.Second {
		t.Fatalf("interrupt took %v; the run would feel hung", elapsed)
	}
}

// The sandbox is pure computation: no HTTP, module, filesystem or timer
// escape hatches exist inside the VM.
func TestScriptSandboxHasNoIO(t *testing.T) {
	got := runScript(t, `
		return [typeof fetch, typeof require, typeof XMLHttpRequest,
			typeof setTimeout, typeof process].join(",")`, scriptInput())
	if got != "undefined,undefined,undefined,undefined,undefined" {
		t.Fatalf("sandbox leaks host facilities: %v", got)
	}
}

func TestScriptOutputCap(t *testing.T) {
	_, err := Execute(Spec{Mode: ModeScript, Script: `return "x".repeat(` + "2*1024*1024" + `)`}, scriptInput())
	if err == nil || !strings.Contains(err.Error(), "byte cap") {
		t.Fatalf("want output-cap error, got %v", err)
	}
}

func TestScriptHelpers(t *testing.T) {
	got := runScript(t, `
		const members = nodes.createOrg.body.members
		return {
			grouped: _.keys(_.groupBy(members, 'active')).sort(),
			uniq: _.uniq([1, 2, 2, 3]),
			chunk: _.chunk([1, 2, 3], 2),
			sum: _.sumBy(members, m => m.active ? 1 : 0),
			picked: _.pick(members[0], ['email']),
			sorted: _.sortBy([3, 1, 2]),
		}`, scriptInput())
	want := map[string]any{
		"grouped": []any{"false", "true"},
		"uniq":    []any{float64(1), float64(2), float64(3)},
		"chunk":   []any{[]any{float64(1), float64(2)}, []any{float64(3)}},
		"sum":     float64(2),
		"picked":  map[string]any{"email": "a@x.io"},
		"sorted":  []any{float64(1), float64(2), float64(3)},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func TestScriptHelpersFrozen(t *testing.T) {
	// Freezing means assignment silently no-ops (non-strict script scope);
	// the original helper must survive.
	got := runScript(t, `
		try { _.sum = () => "hacked" } catch (e) {}
		return _.sum([1, 2])`, scriptInput())
	if got != float64(3) {
		t.Fatalf("_ was mutated: %v", got)
	}
}

func TestScriptErrors(t *testing.T) {
	cases := []struct {
		name, script, want string
	}{
		{"empty", "  ", "script is empty"},
		{"syntax", "return {", "transform.js"},
		{"throw with line", "\n\nnull.x", "transform.js:3"},
		{"no return", "1 + 1", "returned no value"},
		{"non-serializable", "return () => 1", "JSON-serializable"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			_, err := Execute(Spec{Mode: ModeScript, Script: c.script}, scriptInput())
			if err == nil || !strings.Contains(err.Error(), c.want) {
				t.Fatalf("want error containing %q, got %v", c.want, err)
			}
		})
	}
}
