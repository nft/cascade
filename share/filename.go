package share

import "strings"

// CascadeFileSuffix is the canonical extension of exported board files; the
// double extension keeps files self-identifying while staying plain JSON to
// every other tool.
const CascadeFileSuffix = ".cascade.json"

// fallbackFileStem names an export when both display names slug to nothing.
const fallbackFileStem = "board"

// ExportFileName derives the save-dialog default for a board export:
// "<project>-<board>.cascade.json", with display names reduced to
// filesystem-safe slugs.
func ExportFileName(projectName, boardName string) string {
	parts := []string{}
	for _, name := range []string{projectName, boardName} {
		if slug := fileSlug(name); slug != "" {
			parts = append(parts, slug)
		}
	}
	if len(parts) == 0 {
		parts = []string{fallbackFileStem}
	}
	return strings.Join(parts, "-") + CascadeFileSuffix
}

// fileSlug lowercases a display name and collapses everything outside
// [a-z0-9] into single dashes — safe on every filesystem and URL.
func fileSlug(name string) string {
	var b strings.Builder
	pendingDash := false
	for _, r := range strings.ToLower(name) {
		isSafe := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9')
		if !isSafe {
			pendingDash = b.Len() > 0
			continue
		}
		if pendingDash {
			b.WriteByte('-')
			pendingDash = false
		}
		b.WriteRune(r)
	}
	return b.String()
}
