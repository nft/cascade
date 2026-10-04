package update

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestAssetFor(t *testing.T) {
	cases := []struct {
		goos, goarch string
		want         string
		ok           bool
	}{
		{"darwin", "arm64", AssetMacOS, true},
		{"darwin", "amd64", AssetMacOS, true},
		{"windows", "amd64", AssetWindowsSetup, true},
		{"windows", "arm64", AssetWindowsSetup, false},
		{"linux", "amd64", AssetLinux, true},
		{"linux", "arm64", AssetLinux, false},
		{"freebsd", "amd64", "", false},
	}
	for _, c := range cases {
		got, ok := AssetFor(c.goos, c.goarch)
		if got != c.want || ok != c.ok {
			t.Errorf("AssetFor(%s, %s) = %q, %v; want %q, %v", c.goos, c.goarch, got, ok, c.want, c.ok)
		}
	}
}

func TestBundleFromExecutable(t *testing.T) {
	got, err := bundleFromExecutable("/Applications/Cascade.app/Contents/MacOS/Cascade")
	if err != nil || got != "/Applications/Cascade.app" {
		t.Errorf("bundle = %q, %v", got, err)
	}
	if _, err := bundleFromExecutable("/usr/local/bin/cascade"); !errors.Is(err, ErrNotBundled) {
		t.Errorf("bare binary: %v", err)
	}
}

func TestLocationChecks(t *testing.T) {
	if !isOnDiskImage("/Volumes/Cascade/Cascade.app/Contents/MacOS/Cascade") || isOnDiskImage("/Applications/Cascade.app") {
		t.Error("disk image detection")
	}
	translocated := "/private/var/folders/x/T/AppTranslocation/1234/d/Cascade.app/Contents/MacOS/Cascade"
	if !isTranslocated(translocated) || isTranslocated("/Applications/Cascade.app") {
		t.Error("translocation detection")
	}
}

func TestParseCodesignInfo(t *testing.T) {
	out := "Executable=/Volumes/x/Cascade.app/Contents/MacOS/Cascade\nIdentifier=io.github.nft.cascade\nFormat=app bundle with Mach-O universal\nTeamIdentifier=CD9FYC6QYJ\n"
	info := parseCodesignInfo(out)
	if !info.signedByCascade() {
		t.Errorf("info = %+v should pass", info)
	}
	other := parseCodesignInfo("Identifier=io.github.nft.cascade\nTeamIdentifier=ZZZZZZZZZZ\n")
	if other.signedByCascade() {
		t.Error("another team passed")
	}
	adhoc := parseCodesignInfo("Identifier=io.github.nft.cascade\nTeamIdentifier=not set\n")
	if adhoc.signedByCascade() {
		t.Error("an ad-hoc signature passed")
	}
}

func tarball(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buf bytes.Buffer
	gz := gzip.NewWriter(&buf)
	tw := tar.NewWriter(gz)
	for name, body := range files {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o644, Size: int64(len(body)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		tw.Write(body)
	}
	tw.Close()
	gz.Close()
	return buf.Bytes()
}

func TestExtractBinary(t *testing.T) {
	archive := tarball(t, map[string][]byte{
		"cascade-linux-x64/LICENSE": []byte("MIT"),
		"cascade-linux-x64/Cascade": []byte("#!/bin/sh\necho new\n"),
	})
	dst := filepath.Join(t.TempDir(), "Cascade.new")
	if err := extractBinary(bytes.NewReader(archive), "Cascade", dst); err != nil {
		t.Fatalf("extractBinary: %v", err)
	}
	info, err := os.Stat(dst)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm()&0o111 == 0 {
		t.Errorf("not executable: %v", info.Mode())
	}
	if body, _ := os.ReadFile(dst); string(body) != "#!/bin/sh\necho new\n" {
		t.Errorf("body = %q", body)
	}

	if err := extractBinary(bytes.NewReader(archive), "Other", dst+"2"); !errors.Is(err, errBinaryNotInTarball) {
		t.Errorf("missing name: %v", err)
	}
	if err := extractBinary(bytes.NewReader([]byte("not gzip")), "Cascade", dst+"3"); err == nil {
		t.Error("garbage extracted")
	}
}

func TestDirWritable(t *testing.T) {
	if !dirWritable(t.TempDir()) {
		t.Error("a temp dir is writable")
	}
	if dirWritable(filepath.Join(t.TempDir(), "missing")) {
		t.Error("a missing dir is not")
	}
}
