package binding

import "testing"

func TestTemplateSpansLocatesTokens(t *testing.T) {
	const tpl = "member+{{ n1.body.id }}-{{i}}@x.io"
	spans, err := TemplateSpans(tpl)
	if err != nil {
		t.Fatalf("TemplateSpans: %v", err)
	}
	if len(spans) != 2 {
		t.Fatalf("spans = %+v; want 2", spans)
	}
	// The span covers the braces and the padding inside them, so splicing it
	// out and back in is byte-preserving.
	if got := tpl[spans[0].Start:spans[0].End]; got != "{{ n1.body.id }}" {
		t.Errorf("span 0 = %q", got)
	}
	if !spans[0].IsRef || spans[0].Ref != (Ref{Node: "n1", Path: "body.id"}) {
		t.Errorf("span 0 ref = %+v, isRef %v", spans[0].Ref, spans[0].IsRef)
	}
	if got := tpl[spans[1].Start:spans[1].End]; got != "{{i}}" {
		t.Errorf("span 1 = %q", got)
	}
	if spans[1].IsRef {
		t.Error("{{i}} is the loop index, not a node reference")
	}
}

func TestTemplateSpansAgreesWithTemplateRefs(t *testing.T) {
	const tpl = "{{a.x}} {{item.y}} {{res[0].id}} {{i}} {{b}}"
	refs, err := TemplateRefs(tpl)
	if err != nil {
		t.Fatalf("TemplateRefs: %v", err)
	}
	spans, err := TemplateSpans(tpl)
	if err != nil {
		t.Fatalf("TemplateSpans: %v", err)
	}
	var fromSpans []Ref
	for _, s := range spans {
		if s.IsRef {
			fromSpans = append(fromSpans, s.Ref)
		}
	}
	if len(fromSpans) != len(refs) {
		t.Fatalf("spans gave %d refs, TemplateRefs gave %d", len(fromSpans), len(refs))
	}
	for i := range refs {
		if fromSpans[i] != refs[i] {
			t.Errorf("ref %d = %+v; want %+v", i, fromSpans[i], refs[i])
		}
	}
}

func TestTemplateSpansRejectsMalformed(t *testing.T) {
	for _, tpl := range []string{"a {{b", "{{}}", "{{ }}"} {
		if _, err := TemplateSpans(tpl); err == nil {
			t.Errorf("TemplateSpans(%q) = nil error; want the same refusal as TemplateRefs", tpl)
		}
	}
}

func TestRefTokenRoundTripsThroughTheParser(t *testing.T) {
	cases := []struct {
		owner, path, want string
	}{
		{"n1", "", "{{n1}}"},
		{"n1", "body.id", "{{n1.body.id}}"},
		// An index path carries its own separator; a dot would make it
		// unparseable on the way back.
		{"n1", "[0].id", "{{n1[0].id}}"},
	}
	for _, c := range cases {
		got := RefToken(c.owner, c.path)
		if got != c.want {
			t.Errorf("RefToken(%q, %q) = %q; want %q", c.owner, c.path, got, c.want)
		}
		refs, err := TemplateRefs(got)
		if err != nil {
			t.Fatalf("TemplateRefs(%q): %v", got, err)
		}
		if len(refs) != 1 || refs[0].Node != c.owner || refs[0].Path != c.path {
			t.Errorf("%q parsed back to %+v; want node %q path %q", got, refs, c.owner, c.path)
		}
	}
}
