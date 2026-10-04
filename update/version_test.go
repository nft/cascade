package update

import "testing"

func TestParseVersion(t *testing.T) {
	cases := []struct {
		in   string
		want Version
	}{
		{"v0.1.0", Version{Major: 0, Minor: 1, Patch: 0}},
		{"1.2.3", Version{Major: 1, Minor: 2, Patch: 3}},
		{"v0.2.0-beta.1", Version{Major: 0, Minor: 2, Patch: 0, Pre: []string{"beta", "1"}}},
		{" v1.0.0+build.7 ", Version{Major: 1, Minor: 0, Patch: 0}},
	}
	for _, c := range cases {
		got, err := ParseVersion(c.in)
		if err != nil {
			t.Fatalf("ParseVersion(%q): %v", c.in, err)
		}
		if got.Compare(c.want) != 0 || len(got.Pre) != len(c.want.Pre) {
			t.Errorf("ParseVersion(%q) = %+v, want %+v", c.in, got, c.want)
		}
	}
}

func TestParseVersionRejectsMalformed(t *testing.T) {
	for _, in := range []string{"", "v1.2", "1.2.3.4", "v01.0.0", "v1.-2.0", "v1.0.0-", "abc"} {
		if _, err := ParseVersion(in); err == nil {
			t.Errorf("ParseVersion(%q) accepted", in)
		}
	}
}

func TestCompare(t *testing.T) {
	ordered := []string{
		"v0.0.9",
		"v0.1.0-alpha",
		"v0.1.0-alpha.1",
		"v0.1.0-alpha.beta",
		"v0.1.0-beta",
		"v0.1.0-beta.2",
		"v0.1.0-beta.11",
		"v0.1.0-rc.1",
		"v0.1.0",
		"v0.1.1",
		"v0.2.0",
		"v1.0.0",
	}
	for i := 1; i < len(ordered); i++ {
		lo, _ := ParseVersion(ordered[i-1])
		hi, _ := ParseVersion(ordered[i])
		if lo.Compare(hi) != -1 || hi.Compare(lo) != 1 || lo.Compare(lo) != 0 {
			t.Errorf("%s should sort below %s", ordered[i-1], ordered[i])
		}
	}
}

func TestIsNewer(t *testing.T) {
	cases := []struct {
		tag, current string
		want         bool
	}{
		{"v0.2.0", "0.1.0", true},
		{"v0.1.0", "0.1.0", false},
		{"v0.1.0", "0.1.1", false},
		{"v0.1.0", "0.1.0-beta.1", true},
		{"v0.1.0-beta.1", "0.1.0", false},
	}
	for _, c := range cases {
		got, err := IsNewer(c.tag, c.current)
		if err != nil {
			t.Fatalf("IsNewer(%q, %q): %v", c.tag, c.current, err)
		}
		if got != c.want {
			t.Errorf("IsNewer(%q, %q) = %v, want %v", c.tag, c.current, got, c.want)
		}
	}
	if _, err := IsNewer("latest", "0.1.0"); err == nil {
		t.Error("a tag that is not a version must be an error, not 'no update'")
	}
}
