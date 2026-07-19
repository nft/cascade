package binding

import (
	"encoding/json"
	"fmt"
	"strconv"
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
}

func parseTemplate(tpl string) ([]templatePart, error) {
	var parts []templatePart
	rest := tpl
	for {
		open := strings.Index(rest, templateOpen)
		if open < 0 {
			if rest != "" {
				parts = append(parts, templatePart{text: rest})
			}
			return parts, nil
		}
		if open > 0 {
			parts = append(parts, templatePart{text: rest[:open]})
		}
		rest = rest[open+len(templateOpen):]
		close := strings.Index(rest, templateClose)
		if close < 0 {
			return nil, fmt.Errorf("binding: unterminated %q in template %q", templateOpen, tpl)
		}
		expr := strings.TrimSpace(rest[:close])
		if expr == "" {
			return nil, fmt.Errorf("binding: empty reference in template %q", tpl)
		}
		parts = append(parts, templatePart{expr: expr, isRef: true})
		rest = rest[close+len(templateClose):]
	}
}

// parseRefExpr maps a {{…}} expression to a Ref. {{i}} and {{item…}} are
// loop-scope references, not node references, and return ok=false.
func parseRefExpr(expr string) (ref Ref, ok bool) {
	if expr == refIndex {
		return Ref{}, false
	}
	if expr == refRes {
		return Ref{}, true
	}
	if rest, found := strings.CutPrefix(expr, refRes+"."); found {
		return Ref{Path: rest}, true
	}
	owner, path := splitFirst(expr)
	if owner == refItem {
		return Ref{}, false
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
		s, err := stringify(v)
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

// stringify renders a resolved value for interpolation into surrounding
// text. Objects and arrays interpolate as compact JSON.
func stringify(v any) (string, error) {
	switch t := v.(type) {
	case nil:
		return "null", nil
	case string:
		return t, nil
	case bool:
		return strconv.FormatBool(t), nil
	case int:
		return strconv.Itoa(t), nil
	case int64:
		return strconv.FormatInt(t, 10), nil
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64), nil
	default:
		raw, err := json.Marshal(t)
		if err != nil {
			return "", fmt.Errorf("binding: cannot interpolate value of type %T: %w", v, err)
		}
		return string(raw), nil
	}
}
