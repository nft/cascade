package binding

import (
	"fmt"
	"strings"
)

const (
	templateOpen  = "{{"
	templateClose = "}}"
	// refIndex is the fan-out iteration index reference (M6): {{i}}.
	refIndex = "i"
	// refRes is the single-direct-upstream sugar: {{res.name}}.
	refRes = "res"
	// refItem is the each-mode loop element (plan 09): {{item}} / {{item.name}}.
	refItem = "item"
)

// templatePart is one literal or reference chunk of a parsed template.
type templatePart struct {
	text  string
	expr  string // trimmed {{…}} content when isRef
	isRef bool
	// start and end bound the whole {{…}} token in the source string, so a
	// caller rewriting one reference can splice it and leave every other byte
	// — the spacing inside the other braces included — as the author wrote it.
	start, end int
}

func parseTemplate(tpl string) ([]templatePart, error) {
	var parts []templatePart
	pos := 0
	for {
		open := strings.Index(tpl[pos:], templateOpen)
		if open < 0 {
			if pos < len(tpl) {
				parts = append(parts, templatePart{text: tpl[pos:]})
			}
			return parts, nil
		}
		open += pos
		if open > pos {
			parts = append(parts, templatePart{text: tpl[pos:open]})
		}
		inner := open + len(templateOpen)
		close := strings.Index(tpl[inner:], templateClose)
		if close < 0 {
			return nil, fmt.Errorf("binding: unterminated %q in template %q", templateOpen, tpl)
		}
		close += inner
		expr := strings.TrimSpace(tpl[inner:close])
		if expr == "" {
			return nil, fmt.Errorf("binding: empty reference in template %q", tpl)
		}
		end := close + len(templateClose)
		parts = append(parts, templatePart{expr: expr, isRef: true, start: open, end: end})
		pos = end
	}
}

// parseRefExpr maps a {{…}} expression to a Ref. {{i}} and {{item…}} are
// loop-scope references, not node references, and return ok=false.
func parseRefExpr(expr string) (ref Ref, ok bool) {
	if expr == refIndex {
		return Ref{}, false
	}
	// The owner has to come from splitFirst, which also breaks on '[':
	// comparing expr against "res" and "res." first would leave "res[0].id"
	// unmatched and turn it into a reference to a node named "res".
	owner, path := splitFirst(expr)
	switch owner {
	case refItem:
		return Ref{}, false
	case refRes:
		return Ref{Path: path}, true
	}
	return Ref{Node: owner, Path: path}, true
}

// TemplateRefs returns the node references a template makes, in order of
// appearance. A malformed template (unterminated or empty {{…}}) is an error.
func TemplateRefs(tpl string) ([]Ref, error) {
	parts, err := parseTemplate(tpl)
	if err != nil {
		return nil, err
	}
	var refs []Ref
	for _, p := range parts {
		if !p.isRef {
			continue
		}
		if ref, ok := parseRefExpr(p.expr); ok {
			refs = append(refs, ref)
		}
	}
	return refs, nil
}

// TemplateSpan is one {{…}} token located in its source: Start and End bound
// the whole token, braces included. Ref is meaningful only when IsRef — {{i}}
// and {{item…}} are loop-scope values, not node references.
type TemplateSpan struct {
	Start, End int
	Expr       string
	Ref        Ref
	IsRef      bool
}

// TemplateSpans returns every {{…}} token with its byte range, so a caller
// that rewrites references in place has one parser to agree with rather than
// a regex of its own. Malformed templates error exactly as TemplateRefs does.
func TemplateSpans(tpl string) ([]TemplateSpan, error) {
	parts, err := parseTemplate(tpl)
	if err != nil {
		return nil, err
	}
	var spans []TemplateSpan
	for _, p := range parts {
		if !p.isRef {
			continue
		}
		ref, isRef := parseRefExpr(p.expr)
		spans = append(spans, TemplateSpan{
			Start: p.start, End: p.end, Expr: p.expr, Ref: ref, IsRef: isRef,
		})
	}
	return spans, nil
}

// RefExpr joins an owner and accessor path into a reference expression — the
// inverse of splitFirst, so an index path joins without a dot: ("n1",
// "[0].id") is n1[0].id, never n1.[0].id.
func RefExpr(owner, path string) string {
	switch {
	case path == "":
		return owner
	case strings.HasPrefix(path, "["):
		return owner + path
	default:
		return owner + "." + path
	}
}

// RefToken is RefExpr wrapped in {{…}}.
func RefToken(owner, path string) string {
	return templateOpen + RefExpr(owner, path) + templateClose
}

func (e *Env) resolveTemplate(tpl string) (any, error) {
	parts, err := parseTemplate(tpl)
	if err != nil {
		return nil, err
	}
	// A field whose entire value is a single {{…}} keeps the referenced
	// value's JSON type (a number stays a number).
	if len(parts) == 1 && parts[0].isRef {
		return e.resolveExpr(parts[0].expr)
	}
	var b strings.Builder
	for _, p := range parts {
		if !p.isRef {
			b.WriteString(p.text)
			continue
		}
		v, err := e.resolveExpr(p.expr)
		if err != nil {
			return nil, err
		}
		s, err := Stringify(v)
		if err != nil {
			return nil, err
		}
		b.WriteString(s)
	}
	return b.String(), nil
}

func (e *Env) resolveExpr(expr string) (any, error) {
	if expr == refIndex {
		return e.Index, nil
	}
	if owner, rest := splitFirst(expr); owner == refItem {
		return e.resolveItem(expr, rest)
	}
	ref, ok := parseRefExpr(expr)
	if !ok {
		return nil, fmt.Errorf("binding: unknown reference %q", expr)
	}
	return e.resolveRef(ref)
}

// resolveItem resolves {{item}} (the whole element — bare works for
// primitive arrays) or {{item.path}} against the current loop element.
func (e *Env) resolveItem(fullExpr, rest string) (any, error) {
	if !e.HasItem {
		return nil, fmt.Errorf("binding: {{%s}} is only available inside an each-mode for loop", refItem)
	}
	if rest == "" {
		return e.Item, nil
	}
	return resolveValuePath(refItem, e.Item, fullExpr, rest)
}
