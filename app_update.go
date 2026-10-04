package main

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"cascade/update"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Where the app updates from and the pages it may open in the browser.
const (
	repoOwner   = "nft"
	repoName    = "cascade"
	repoURL     = "https://github.com/" + repoOwner + "/" + repoName
	releasesURL = repoURL + "/releases"
	websiteURL  = "https://" + repoOwner + ".github.io/" + repoName
	newIssueURL = repoURL + "/issues/new"
)

// UpdateProgressEvent is the Wails event carrying download progress.
const UpdateProgressEvent = "update:progress"

// What a check can conclude; the frontend mirrors these in updates.svelte.ts.
const (
	UpdateUpToDate    = "upToDate"
	UpdateAvailable   = "available"
	UpdateUnsupported = "unsupported"
)

const (
	updateCheckTimeout = 15 * time.Second
	updateCacheDirName = "updates"
	// Progress events are rate-limited so a fast download does not flood the bridge.
	progressInterval = 100 * time.Millisecond
	// The InstallUpdate reply must reach the frontend before the window goes.
	quitDelay       = 300 * time.Millisecond
	userAgentFormat = "Cascade/%s (%s; %s)"
	// The prefix the update package puts on its errors; users see the rest.
	updateErrPrefix = "update: "
)

var (
	errCheckFirst       = errors.New("check for updates before downloading")
	errDownloadInFlight = errors.New("a download is already in progress")
	errNothingToInstall = errors.New("download the update before installing it")
	errURLNotAllowed    = errors.New("only Cascade's own pages open from the app")
	errNoVersion        = errors.New("this build carries no version")
)

// AppInfo identifies the running build to the frontend.
type AppInfo struct {
	Version     string `json:"version"`
	OS          string `json:"os"`
	Arch        string `json:"arch"`
	ReleasesURL string `json:"releasesUrl"`
	WebsiteURL  string `json:"websiteUrl"`
	NewIssueURL string `json:"newIssueUrl"`
}

// UpdateRelease is the newer release a check found.
type UpdateRelease struct {
	Version     string    `json:"version"`
	Tag         string    `json:"tag"`
	Notes       string    `json:"notes"`
	URL         string    `json:"url"`
	PublishedAt time.Time `json:"publishedAt"`
	AssetName   string    `json:"assetName,omitempty"`
	AssetSize   int64     `json:"assetSize,omitempty"`
}

// UpdateCheck is the outcome of one check. Plan says how an install would
// apply here; InstallBlocker says why it cannot, before anything downloads.
type UpdateCheck struct {
	Status         string         `json:"status"`
	Release        *UpdateRelease `json:"release,omitempty"`
	Plan           *update.Plan   `json:"plan,omitempty"`
	InstallBlocker string         `json:"installBlocker,omitempty"`
}

// UpdateProgress is one download progress report; Total is -1 when unknown.
type UpdateProgress struct {
	Tag   string `json:"tag"`
	Done  int64  `json:"done"`
	Total int64  `json:"total"`
}

// updater carries the update flow between the bound calls: the release the
// last check found, the download in flight, the verified package.
type updater struct {
	source   update.Source
	client   *http.Client
	version  string
	goos     string
	goarch   string
	cacheDir string
	emit     func(UpdateProgress)
	quit     func()
	exe      func() (string, error)

	mu         sync.Mutex
	release    *update.Release
	asset      update.Asset
	downloaded string
	cancel     context.CancelFunc
}

func newUpdater(version, cacheDir string) *updater {
	// No overall timeout on the download client: a package takes as long as
	// the connection allows, and cancellation goes through the context.
	return &updater{
		source: update.Source{
			Client:    &http.Client{Timeout: updateCheckTimeout},
			Owner:     repoOwner,
			Repo:      repoName,
			UserAgent: fmt.Sprintf(userAgentFormat, version, runtime.GOOS, runtime.GOARCH),
		},
		client:   &http.Client{},
		version:  version,
		goos:     runtime.GOOS,
		goarch:   runtime.GOARCH,
		cacheDir: cacheDir,
		emit:     func(UpdateProgress) {},
		quit:     func() {},
		exe:      os.Executable,
	}
}

// updateCacheDir is where packages download to; cleared on every launch.
func updateCacheDir() string {
	base, err := os.UserCacheDir()
	if err != nil {
		base = os.TempDir()
	}
	return filepath.Join(base, appDataDirName, updateCacheDirName)
}

func (u *updater) clearCache() {
	os.RemoveAll(u.cacheDir)
}

// AppInfo returns the running build's version, platform and links.
func (a *App) AppInfo() AppInfo {
	return AppInfo{
		Version:     a.updates.version,
		OS:          a.updates.goos,
		Arch:        a.updates.goarch,
		ReleasesURL: releasesURL,
		WebsiteURL:  websiteURL,
		NewIssueURL: newIssueURL,
	}
}

// CheckForUpdate asks GitHub for the latest release and compares it with the
// running version. No release yet counts as up to date.
func (a *App) CheckForUpdate() (UpdateCheck, error) {
	return a.updates.check(context.Background())
}

func (u *updater) check(ctx context.Context) (UpdateCheck, error) {
	if u.version == "" {
		return UpdateCheck{}, errNoVersion
	}
	rel, err := u.source.Latest(ctx)
	if errors.Is(err, update.ErrNoRelease) {
		return UpdateCheck{Status: UpdateUpToDate}, nil
	}
	if err != nil {
		return UpdateCheck{}, err
	}
	newer, err := update.IsNewer(rel.Tag, u.version)
	if err != nil {
		return UpdateCheck{}, err
	}
	if !newer {
		return UpdateCheck{Status: UpdateUpToDate}, nil
	}
	info := &UpdateRelease{Version: rel.Version, Tag: rel.Tag, Notes: rel.Notes, URL: rel.URL, PublishedAt: rel.PublishedAt}
	name, supported := update.AssetFor(u.goos, u.goarch)
	asset, published := rel.Asset(name)
	if !supported || !published {
		return UpdateCheck{Status: UpdateUnsupported, Release: info}, nil
	}
	info.AssetName, info.AssetSize = asset.Name, asset.Size

	u.mu.Lock()
	u.release, u.asset, u.downloaded = &rel, asset, ""
	u.mu.Unlock()

	result := UpdateCheck{Status: UpdateAvailable, Release: info}
	result.Plan, result.InstallBlocker = u.stage()
	return result, nil
}

// stage finds out now whether an install could succeed, so the user is not
// told after the download.
func (u *updater) stage() (*update.Plan, string) {
	exe, err := u.exe()
	if err != nil {
		return nil, userMessage(err)
	}
	plan, err := update.Stage(exe)
	if err != nil {
		return nil, userMessage(err)
	}
	return &plan, ""
}

func userMessage(err error) string {
	return strings.TrimPrefix(err.Error(), updateErrPrefix)
}

// DownloadUpdate fetches the package the last check found and verifies it
// against the release's checksums, streaming progress events meanwhile.
func (a *App) DownloadUpdate(tag string) error {
	return a.updates.download(tag)
}

func (u *updater) download(tag string) error {
	ctx, rel, asset, err := u.beginDownload(tag)
	if err != nil {
		return err
	}
	defer u.endDownload()

	sumsAsset, ok := rel.Asset(update.AssetChecksums)
	if !ok {
		return fmt.Errorf("the release has no %s", update.AssetChecksums)
	}
	sums, err := update.FetchSums(ctx, u.client, sumsAsset.URL)
	if err != nil {
		return err
	}
	dst := filepath.Join(u.cacheDir, tag, asset.Name)
	if err := update.Download(ctx, u.client, asset.URL, dst, u.progress(tag)); err != nil {
		return err
	}
	if err := update.Verify(dst, asset.Name, sums, asset.Digest); err != nil {
		return err
	}
	u.mu.Lock()
	u.downloaded = dst
	u.mu.Unlock()
	return nil
}

func (u *updater) beginDownload(tag string) (context.Context, *update.Release, update.Asset, error) {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.release == nil || u.release.Tag != tag {
		return nil, nil, update.Asset{}, errCheckFirst
	}
	if u.cancel != nil {
		return nil, nil, update.Asset{}, errDownloadInFlight
	}
	ctx, cancel := context.WithCancel(context.Background())
	u.cancel = cancel
	return ctx, u.release, u.asset, nil
}

func (u *updater) endDownload() {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.cancel != nil {
		u.cancel()
		u.cancel = nil
	}
}

// progress rate-limits the events, always letting the final one through.
func (u *updater) progress(tag string) update.Progress {
	var last time.Time
	return func(done, total int64) {
		now := time.Now()
		if done != total && now.Sub(last) < progressInterval {
			return
		}
		last = now
		u.emit(UpdateProgress{Tag: tag, Done: done, Total: total})
	}
}

// CancelUpdateDownload stops a download in flight; nothing in flight is a no-op.
func (a *App) CancelUpdateDownload() {
	a.updates.mu.Lock()
	defer a.updates.mu.Unlock()
	if a.updates.cancel != nil {
		a.updates.cancel()
	}
}

// InstallUpdate applies the verified package and quits so the new version
// can take over; the returned plan says whether it relaunches by itself.
func (a *App) InstallUpdate() (update.Plan, error) {
	return a.updates.install(context.Background())
}

func (u *updater) install(ctx context.Context) (update.Plan, error) {
	u.mu.Lock()
	pkg := u.downloaded
	u.mu.Unlock()
	if pkg == "" {
		return update.Plan{}, errNothingToInstall
	}
	exe, err := u.exe()
	if err != nil {
		return update.Plan{}, err
	}
	plan, err := update.Stage(exe)
	if err != nil {
		return update.Plan{}, err
	}
	if err := update.Apply(ctx, plan, pkg); err != nil {
		return update.Plan{}, err
	}
	u.quit()
	return plan, nil
}

// OpenExternal opens one of Cascade's own pages in the system browser.
func (a *App) OpenExternal(url string) error {
	if !strings.HasPrefix(url, repoURL) && !strings.HasPrefix(url, websiteURL) {
		return errURLNotAllowed
	}
	wailsruntime.BrowserOpenURL(a.ctx, url)
	return nil
}

func (a *App) emitUpdateProgress(p UpdateProgress) {
	wailsruntime.EventsEmit(a.ctx, UpdateProgressEvent, p)
}

func (a *App) quitForUpdate() {
	time.AfterFunc(quitDelay, func() { wailsruntime.Quit(a.ctx) })
}
