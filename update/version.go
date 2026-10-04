// Package update finds a newer Cascade release on GitHub, downloads and
// verifies its package for this machine and swaps it into place. It is
// UI-free: the Wails shell binds it and owns the conversation with the user.
package update

import (
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// Version is a release tag parsed as semantic version: vMAJOR.MINOR.PATCH with
// an optional -prerelease. Build metadata after + is ignored, as semver says.
type Version struct {
	Major, Minor, Patch int
	Pre                 []string
}

const (
	versionParts     = 3
	tagPrefix        = "v"
	preSeparator     = "-"
	metaSeparator    = "+"
	identSeparator   = "."
	versionPartsHint = "MAJOR.MINOR.PATCH"
)

var errEmptyVersion = errors.New("update: empty version")

// ParseVersion accepts "v0.1.0", "0.1.0" and "v0.2.0-beta.1".
func ParseVersion(s string) (Version, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return Version{}, errEmptyVersion
	}
	s = strings.TrimPrefix(s, tagPrefix)
	if meta := strings.Index(s, metaSeparator); meta >= 0 {
		s = s[:meta]
	}
	core, pre, hasPre := strings.Cut(s, preSeparator)
	parts := strings.Split(core, identSeparator)
	if len(parts) != versionParts {
		return Version{}, fmt.Errorf("update: version %q is not %s", s, versionPartsHint)
	}
	var v Version
	nums := []*int{&v.Major, &v.Minor, &v.Patch}
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 || (len(part) > 1 && part[0] == '0') {
			return Version{}, fmt.Errorf("update: version %q has a bad number %q", s, part)
		}
		*nums[i] = n
	}
	if hasPre {
		if pre == "" {
			return Version{}, fmt.Errorf("update: version %q has an empty prerelease", s)
		}
		v.Pre = strings.Split(pre, identSeparator)
	}
	return v, nil
}

// Compare orders versions as semver does: by number, then a release above
// any of its prereleases, then prerelease identifiers numerically when both
// are numbers and lexically otherwise.
func (v Version) Compare(o Version) int {
	for _, pair := range [][2]int{{v.Major, o.Major}, {v.Minor, o.Minor}, {v.Patch, o.Patch}} {
		if pair[0] != pair[1] {
			return sign(pair[0] - pair[1])
		}
	}
	switch {
	case len(v.Pre) == 0 && len(o.Pre) == 0:
		return 0
	case len(v.Pre) == 0:
		return 1
	case len(o.Pre) == 0:
		return -1
	}
	return comparePre(v.Pre, o.Pre)
}

func comparePre(a, b []string) int {
	for i := 0; i < len(a) && i < len(b); i++ {
		if c := compareIdent(a[i], b[i]); c != 0 {
			return c
		}
	}
	return sign(len(a) - len(b))
}

func compareIdent(a, b string) int {
	an, aErr := strconv.Atoi(a)
	bn, bErr := strconv.Atoi(b)
	switch {
	case aErr == nil && bErr == nil:
		return sign(an - bn)
	case aErr == nil:
		// Numeric identifiers rank below alphanumeric ones.
		return -1
	case bErr == nil:
		return 1
	}
	return strings.Compare(a, b)
}

func sign(n int) int {
	switch {
	case n < 0:
		return -1
	case n > 0:
		return 1
	}
	return 0
}

// IsNewer reports whether the release tag is a later version than the one
// running. Either side failing to parse is an error, not "no update".
func IsNewer(tag, current string) (bool, error) {
	latest, err := ParseVersion(tag)
	if err != nil {
		return false, err
	}
	running, err := ParseVersion(current)
	if err != nil {
		return false, err
	}
	return latest.Compare(running) > 0, nil
}
