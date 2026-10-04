package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"

	"cascade/update"
)

// fakeRelease is a GitHub release for this platform's asset plus checksums,
// served from one httptest server that also hands out the files.
type fakeRelease struct {
	server  *httptest.Server
	tag     string
	payload []byte
	sums    string
	status  int
}

func newFakeRelease(t *testing.T, tag string, payload []byte) *fakeRelease {
	t.Helper()
	f := &fakeRelease{tag: tag, payload: payload, status: http.StatusOK}
	sum := sha256.Sum256(payload)
	assetName, _ := update.AssetFor(runtime.GOOS, runtime.GOARCH)
	f.sums = hex.EncodeToString(sum[:]) + "  " + assetName + "\n"
	mux := http.NewServeMux()
	mux.HandleFunc("/repos/nft/cascade/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		if f.status != http.StatusOK {
			w.WriteHeader(f.status)
			return
		}
		fmt.Fprintf(w, `{"tag_name":%q,"html_url":"https://github.com/nft/cascade/releases/tag/%s","published_at":"2026-10-10T12:00:00Z","body":"## Notes","assets":[`+
			`{"name":%q,"size":%d,"browser_download_url":"%s/pkg"},`+
			`{"name":%q,"size":%d,"browser_download_url":"%s/sums"}]}`,
			f.tag, f.tag, assetName, len(f.payload), f.server.URL, update.AssetChecksums, len(f.sums), f.server.URL)
	})
	mux.HandleFunc("/pkg", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", strconv.Itoa(len(f.payload)))
		w.Write(f.payload)
	})
	mux.HandleFunc("/sums", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(f.sums)) })
	f.server = httptest.NewServer(mux)
	t.Cleanup(f.server.Close)
	return f
}

// fakeExe is an executable path that every platform's Stage accepts: inside
// a writable bundle-shaped directory.
func fakeExe(t *testing.T) string {
	t.Helper()
	bundle := filepath.Join(t.TempDir(), "Cascade.app")
	exe := filepath.Join(bundle, "Contents", "MacOS", "Cascade")
	if err := os.MkdirAll(filepath.Dir(exe), 0o755); err != nil {
		t.Fatal(err)
	}
	return exe
}

func testUpdater(t *testing.T, f *fakeRelease, version string) (*updater, *[]UpdateProgress, *int) {
	t.Helper()
	u := newUpdater(version, filepath.Join(t.TempDir(), "updates"))
	u.source.APIBase = f.server.URL
	u.source.Client = f.server.Client()
	u.client = f.server.Client()
	var events []UpdateProgress
	quits := 0
	u.emit = func(p UpdateProgress) { events = append(events, p) }
	u.quit = func() { quits++ }
	exe := fakeExe(t)
	u.exe = func() (string, error) { return exe, nil }
	return u, &events, &quits
}

func TestAppVersionComesFromWailsJSON(t *testing.T) {
	t.Setenv(versionEnv, "")
	v := appVersion()
	if _, err := update.ParseVersion(v); err != nil {
		t.Fatalf("embedded productVersion %q: %v", v, err)
	}
	t.Setenv(versionEnv, "0.0.1")
	if appVersion() != "0.0.1" {
		t.Error("the environment override is ignored")
	}
}

func TestCheckForUpdateOutcomes(t *testing.T) {
	f := newFakeRelease(t, "v0.2.0", []byte("package"))

	u, _, _ := testUpdater(t, f, "0.1.0")
	got, err := u.check(context.Background())
	if err != nil {
		t.Fatalf("check: %v", err)
	}
	if got.Status != UpdateAvailable || got.Release == nil || got.Release.Version != "0.2.0" || got.Release.AssetSize != int64(len(f.payload)) {
		t.Errorf("newer release: %+v", got)
	}
	if got.Plan == nil || got.Plan.Kind == "" || got.InstallBlocker != "" {
		t.Errorf("plan = %+v, blocker = %q", got.Plan, got.InstallBlocker)
	}

	u, _, _ = testUpdater(t, f, "0.2.0")
	if got, err = u.check(context.Background()); err != nil || got.Status != UpdateUpToDate || got.Release != nil {
		t.Errorf("same version: %+v, %v", got, err)
	}

	u, _, _ = testUpdater(t, f, "0.1.0")
	u.goos, u.goarch = "plan9", "mips"
	if got, err = u.check(context.Background()); err != nil || got.Status != UpdateUnsupported || got.Release == nil {
		t.Errorf("no build for the platform: %+v, %v", got, err)
	}

	f.status = http.StatusNotFound
	u, _, _ = testUpdater(t, f, "0.1.0")
	if got, err = u.check(context.Background()); err != nil || got.Status != UpdateUpToDate {
		t.Errorf("nothing published: %+v, %v", got, err)
	}

	f.status = http.StatusBadGateway
	if _, err = u.check(context.Background()); err == nil {
		t.Error("a failing API must be an error, not a verdict")
	}

	u, _, _ = testUpdater(t, f, "")
	if _, err = u.check(context.Background()); !errors.Is(err, errNoVersion) {
		t.Errorf("no version: %v", err)
	}
}

func TestCheckReportsAnInstallBlocker(t *testing.T) {
	f := newFakeRelease(t, "v0.2.0", []byte("package"))
	u, _, _ := testUpdater(t, f, "0.1.0")
	u.exe = func() (string, error) { return "", errors.New("update: nowhere") }
	got, err := u.check(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != UpdateAvailable || got.Plan != nil || got.InstallBlocker != "nowhere" {
		t.Errorf("check = %+v", got)
	}
}

func TestDownloadVerifiesAndReportsProgress(t *testing.T) {
	f := newFakeRelease(t, "v0.2.0", []byte(strings.Repeat("cascade", 500)))
	u, events, _ := testUpdater(t, f, "0.1.0")

	if err := u.download("v0.2.0"); !errors.Is(err, errCheckFirst) {
		t.Fatalf("download before check: %v", err)
	}
	if _, err := u.check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := u.download("v0.2.0"); err != nil {
		t.Fatalf("download: %v", err)
	}
	if u.downloaded == "" {
		t.Fatal("nothing recorded as downloaded")
	}
	if body, err := os.ReadFile(u.downloaded); err != nil || len(body) != len(f.payload) {
		t.Errorf("package on disk: %d bytes, %v", len(body), err)
	}
	if n := len(*events); n == 0 || (*events)[n-1].Done != int64(len(f.payload)) || (*events)[n-1].Total != int64(len(f.payload)) {
		t.Errorf("progress events: %+v", *events)
	}
	if err := u.download("v0.1.9"); !errors.Is(err, errCheckFirst) {
		t.Errorf("another tag: %v", err)
	}
}

func TestDownloadRefusesATamperedPackage(t *testing.T) {
	f := newFakeRelease(t, "v0.2.0", []byte("package"))
	u, _, _ := testUpdater(t, f, "0.1.0")
	if _, err := u.check(context.Background()); err != nil {
		t.Fatal(err)
	}
	f.payload = []byte("something else")
	if err := u.download("v0.2.0"); !errors.Is(err, update.ErrChecksumMismatch) {
		t.Fatalf("download: %v", err)
	}
	if u.downloaded != "" {
		t.Error("a mismatching package was kept")
	}
	entries, _ := os.ReadDir(filepath.Join(u.cacheDir, "v0.2.0"))
	if len(entries) != 0 {
		t.Errorf("left %d files behind", len(entries))
	}
}

func TestInstallNeedsADownload(t *testing.T) {
	f := newFakeRelease(t, "v0.2.0", []byte("package"))
	u, _, quits := testUpdater(t, f, "0.1.0")
	if _, err := u.install(context.Background()); !errors.Is(err, errNothingToInstall) {
		t.Errorf("install: %v", err)
	}
	if *quits != 0 {
		t.Error("quit without installing")
	}
}

func TestAppInfoAndOpenExternalAllowList(t *testing.T) {
	app := &App{updates: newUpdater("0.1.0", t.TempDir())}
	info := app.AppInfo()
	if info.Version != "0.1.0" || info.OS == "" || info.Arch == "" || !strings.HasPrefix(info.ReleasesURL, repoURL) {
		t.Errorf("info = %+v", info)
	}
	if err := app.OpenExternal("https://example.com/"); !errors.Is(err, errURLNotAllowed) {
		t.Errorf("foreign URL: %v", err)
	}
}
