package update

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

func fileServer(t *testing.T, files map[string][]byte) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, ok := files[strings.TrimPrefix(r.URL.Path, "/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		// Small bodies would otherwise go out chunked, with no total to report.
		w.Header().Set("Content-Length", strconv.Itoa(len(body)))
		w.Write(body)
	}))
	t.Cleanup(server.Close)
	return server
}

func sumOf(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

func TestDownloadWritesThroughAPartFileAndReportsProgress(t *testing.T) {
	payload := bytes.Repeat([]byte("cascade"), 1000)
	server := fileServer(t, map[string][]byte{"pkg": payload})
	dst := filepath.Join(t.TempDir(), "nested", "pkg.bin")

	var last, total int64
	err := Download(context.Background(), server.Client(), server.URL+"/pkg", dst, func(done, all int64) { last, total = done, all })
	if err != nil {
		t.Fatalf("Download: %v", err)
	}
	got, err := os.ReadFile(dst)
	if err != nil || !bytes.Equal(got, payload) {
		t.Fatalf("file = %d bytes, %v", len(got), err)
	}
	if last != int64(len(payload)) || total != int64(len(payload)) {
		t.Errorf("progress ended at %d/%d", last, total)
	}
	if _, err := os.Stat(dst + partSuffix); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("the .part file survived: %v", err)
	}
}

func TestDownloadLeavesNothingOnFailure(t *testing.T) {
	server := fileServer(t, nil)
	dst := filepath.Join(t.TempDir(), "pkg.bin")
	if err := Download(context.Background(), server.Client(), server.URL+"/missing", dst, nil); err == nil {
		t.Fatal("a 404 downloaded")
	}
	entries, _ := os.ReadDir(filepath.Dir(dst))
	if len(entries) != 0 {
		t.Errorf("left %d files behind", len(entries))
	}
}

func TestParseSums(t *testing.T) {
	sums, err := ParseSums(strings.NewReader("ABCDEF  Cascade-macOS-universal.dmg\n0123 *Cascade-Windows-x64-setup.exe\n\n"))
	if err != nil {
		t.Fatalf("ParseSums: %v", err)
	}
	if sums[AssetMacOS] != "abcdef" || sums[AssetWindowsSetup] != "0123" || len(sums) != 2 {
		t.Errorf("sums = %v", sums)
	}
	if _, err := ParseSums(strings.NewReader("not a checksum line at all\n")); err == nil {
		t.Error("a malformed line parsed")
	}
}

func TestFetchSumsAndVerify(t *testing.T) {
	payload := []byte("the real package")
	sumsText := sumOf(payload) + "  pkg.bin\n"
	server := fileServer(t, map[string][]byte{"sums": []byte(sumsText), "pkg": payload})
	sums, err := FetchSums(context.Background(), server.Client(), server.URL+"/sums")
	if err != nil {
		t.Fatalf("FetchSums: %v", err)
	}

	dir := t.TempDir()
	good := filepath.Join(dir, "pkg.bin")
	if err := Download(context.Background(), server.Client(), server.URL+"/pkg", good, nil); err != nil {
		t.Fatalf("Download: %v", err)
	}
	if err := Verify(good, "pkg.bin", sums, ""); err != nil {
		t.Errorf("Verify(good): %v", err)
	}
	if err := Verify(good, "pkg.bin", sums, "sha256:"+strings.ToUpper(sumOf(payload))); err != nil {
		t.Errorf("Verify with matching GitHub digest: %v", err)
	}
	if err := Verify(good, "pkg.bin", sums, "sha256:feed"); !errors.Is(err, ErrChecksumMismatch) {
		t.Errorf("Verify with a disagreeing GitHub digest: %v", err)
	}
	if err := Verify(good, "other.bin", sums, ""); err == nil || errors.Is(err, ErrChecksumMismatch) {
		t.Errorf("Verify(unlisted name): %v", err)
	}
}

func TestVerifyDeletesATamperedFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "pkg.bin")
	if err := os.WriteFile(path, []byte("tampered"), downloadFileMode); err != nil {
		t.Fatal(err)
	}
	sums := map[string]string{"pkg.bin": sumOf([]byte("the real package"))}
	if err := Verify(path, "pkg.bin", sums, ""); !errors.Is(err, ErrChecksumMismatch) {
		t.Fatalf("Verify: %v", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Error("the tampered file is still there")
	}
}
