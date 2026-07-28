package nodespec

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"cascade/core"
)

func TestValidate(t *testing.T) {
	cases := []struct {
		name string
		spec Spec
		want string // empty means the spec is valid
	}{{
		name: "a note has nothing to check",
		spec: Spec{Kind: core.NodeTypeNote},
	}, {
		name: "a well-formed http node",
		spec: Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{
			Method: http.MethodPost,
			Fields: []Field{
				{Key: "body.name", Source: FieldLiteral, Value: "Ada"},
				{Key: "path.id", Source: FieldBinding, Ref: &Ref{NodeID: "n1", Path: "body.id"}},
			},
		}},
	}, {
		name: "an unsupported method",
		spec: Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{Method: "FETCH"}},
		want: `unsupported HTTP method "FETCH"`,
	}, {
		// board.ts degrades an unknown method to GET for display; the engine
		// refuses to, because silently GETting a POST node is a data-integrity
		// hazard.
		name: "a missing method",
		spec: Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{}},
		want: `unsupported HTTP method ""`,
	}, {
		name: "a protocol that does not execute",
		spec: Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{Protocol: "ws", Method: http.MethodGet}},
		want: `protocol "ws" is not executable yet`,
	}, {
		name: "an unprefixed field key",
		spec: Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{
			Method: http.MethodPost,
			Fields: []Field{{Key: "amount", Source: FieldLiteral, Value: "100"}},
		}},
		want: "no section prefix",
	}, {
		name: "a bound field with no reference",
		spec: Spec{Kind: core.NodeTypeHTTP, HTTP: &HTTPSpec{
			Method: http.MethodPost,
			Fields: []Field{{Key: "body.id", Source: FieldBinding, Value: "n1.body.id"}},
		}},
		want: `field "body.id":`,
	}, {
		name: "a transform in pick mode",
		spec: Spec{Kind: core.NodeTypeTransform, Transform: &TransformSpec{Mode: "pick"}},
	}, {
		name: "a transform with no mode defaults to pick",
		spec: Spec{Kind: core.NodeTypeTransform, Transform: &TransformSpec{}},
	}, {
		name: "an unknown transform mode",
		spec: Spec{Kind: core.NodeTypeTransform, Transform: &TransformSpec{Mode: "reduce"}},
		want: `unknown transform mode "reduce"`,
	}, {
		name: "a pick row bound to nothing",
		spec: Spec{Kind: core.NodeTypeTransform, Transform: &TransformSpec{
			Mode: "pick",
			Pick: []Field{{Key: "id", Source: FieldBinding}},
		}},
		want: `pick "id":`,
	}, {
		name: "a mock with a valid body",
		spec: Spec{Kind: core.NodeTypeMock, Mock: &MockSpec{Body: `{"id":"u1"}`, Status: 201}},
	}, {
		name: "a mock with an unparseable body",
		spec: Spec{Kind: core.NodeTypeMock, Mock: &MockSpec{Body: `{"id":}`}},
		want: "mock body is not valid JSON",
	}, {
		// An empty body is not an empty document: exec's dispatch fails to
		// unmarshal it, so Validate has to reach the same verdict.
		name: "a mock with no body",
		spec: Spec{Kind: core.NodeTypeMock, Mock: &MockSpec{}},
		want: "mock body is not valid JSON",
	}, {
		name: "a delay in range",
		spec: Spec{Kind: core.NodeTypeDelay, Delay: &DelaySpec{DurationMs: 1500}},
	}, {
		name: "a delay of zero",
		spec: Spec{Kind: core.NodeTypeDelay, Delay: &DelaySpec{}},
		want: "outside",
	}, {
		name: "a delay past the cap",
		spec: Spec{Kind: core.NodeTypeDelay, Delay: &DelaySpec{DurationMs: int(MaxDelay/time.Millisecond) + 1}},
		want: "outside",
	}, {
		name: "a count loop in range",
		spec: Spec{Kind: core.NodeTypeFor, Loop: &LoopSpec{Mode: LoopModeCount, Count: 3}},
	}, {
		name: "a count loop below the floor",
		spec: Spec{Kind: core.NodeTypeFor, Loop: &LoopSpec{Mode: LoopModeCount}},
		want: "loop count 0 is outside",
	}, {
		name: "a count loop past the cap",
		spec: Spec{Kind: core.NodeTypeFor, Loop: &LoopSpec{Mode: LoopModeCount, Count: MaxLoopIterations + 1}},
		want: "outside",
	}, {
		// each mode's element count is only knowable once the source resolves,
		// which is a run-time concern.
		name: "an each loop ignores count",
		spec: Spec{Kind: core.NodeTypeFor, Loop: &LoopSpec{Mode: LoopModeEach, Source: &Ref{NodeID: "n1"}}},
	}, {
		name: "an unknown loop mode",
		spec: Spec{Kind: core.NodeTypeFor, Loop: &LoopSpec{Mode: "while", Count: 1}},
		want: `unknown loop mode "while"`,
	}, {
		// exec's loopIterations has no case for the empty mode either, so the
		// inspector and dispatch agree.
		name: "a loop with no mode",
		spec: Spec{Kind: core.NodeTypeFor, Loop: &LoopSpec{Count: 1}},
		want: `unknown loop mode ""`,
	}}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.spec.Validate()
			if tc.want == "" {
				if err != nil {
					t.Fatalf("Validate() = %v, want nil", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.want) {
				t.Fatalf("Validate() = %v, want one containing %q", err, tc.want)
			}
		})
	}
}

// The golden board is a board a user could actually save, so every node in it
// has to pass the checks the inspector runs.
func TestValidateGoldenBoard(t *testing.T) {
	for id, spec := range loadBoard(t) {
		if err := spec.Validate(); err != nil {
			t.Errorf("node %q: %v", id, err)
		}
	}
}
