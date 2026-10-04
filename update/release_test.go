package update

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const releaseJSON = `{
  "tag_name": "v0.2.0",
  "html_url": "https://github.com/nft/cascade/releases/tag/v0.2.0",
  "published_at": "2026-10-10T12:00:00Z",
  "body": "## [0.2.0] - 2026-10-10\n\n### Added\n\n- Auto-update.",
  "assets": [
    {"name": "Cascade-macOS-universal.dmg", "size": 12345, "browser_download_url": "https://example.test/dmg", "digest": "sha256:abc"},
    {"name": "SHA256SUMS.txt", "size": 300, "browser_download_url": "https://example.test/sums"}
  ]
}`

func TestLatestParsesTheRelease(t *testing.T) {
	var seen http.Header
	var path string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen, path = r.Header.Clone(), r.URL.Path
		w.Write([]byte(releaseJSON))
	}))
	defer server.Close()

	src := Source{Client: server.Client(), APIBase: server.URL, Owner: "nft", Repo: "cascade", UserAgent: "Cascade/0.1.0"}
	rel, err := src.Latest(context.Background())
	if err != nil {
		t.Fatalf("Latest: %v", err)
	}
	if path != "/repos/nft/cascade/releases/latest" {
		t.Errorf("asked %s", path)
	}
	if seen.Get(headerUserAgent) != "Cascade/0.1.0" || seen.Get(headerAccept) != acceptJSON || seen.Get(headerAPIVersion) != apiVersion {
		t.Errorf("headers = %v", seen)
	}
	if rel.Tag != "v0.2.0" || rel.Version != "0.2.0" || !strings.Contains(rel.Notes, "Auto-update") || rel.PublishedAt.IsZero() {
		t.Errorf("release = %+v", rel)
	}
	dmg, ok := rel.Asset(AssetMacOS)
	if !ok || dmg.Size != 12345 || dmg.URL != "https://example.test/dmg" || dmg.Digest != "sha256:abc" {
		t.Errorf("dmg asset = %+v, %v", dmg, ok)
	}
	if _, ok := rel.Asset("nope"); ok {
		t.Error("unknown asset found")
	}
}

func TestLatestReportsNoReleaseAndErrors(t *testing.T) {
	status := http.StatusNotFound
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(status)
	}))
	defer server.Close()
	src := Source{Client: server.Client(), APIBase: server.URL, Owner: "nft", Repo: "cascade"}

	if _, err := src.Latest(context.Background()); !errors.Is(err, ErrNoRelease) {
		t.Errorf("404: err = %v, want ErrNoRelease", err)
	}
	status = http.StatusForbidden
	if _, err := src.Latest(context.Background()); err == nil || errors.Is(err, ErrNoRelease) {
		t.Errorf("403: err = %v, want a plain failure", err)
	}
}
