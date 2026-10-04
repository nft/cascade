package update

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Release is the newest published GitHub release, reduced to what the app
// shows and downloads.
type Release struct {
	// Tag is the git tag, e.g. "v0.2.0"; Version drops the leading v.
	Tag         string    `json:"tag"`
	Version     string    `json:"version"`
	Notes       string    `json:"notes"`
	URL         string    `json:"url"`
	PublishedAt time.Time `json:"publishedAt"`
	Assets      []Asset   `json:"assets"`
}

// Asset is one downloadable file of a release.
type Asset struct {
	Name string `json:"name"`
	Size int64  `json:"size"`
	URL  string `json:"url"`
	// Digest is GitHub's own "sha256:<hex>" for the upload, when it has one.
	Digest string `json:"digest,omitempty"`
}

// Asset finds a release file by name.
func (r Release) Asset(name string) (Asset, bool) {
	for _, a := range r.Assets {
		if a.Name == name {
			return a, true
		}
	}
	return Asset{}, false
}

// ErrNoRelease means the repository has published nothing yet.
var ErrNoRelease = errors.New("update: no release has been published")

const (
	// DefaultAPIBase is GitHub's REST endpoint; tests point Source at httptest.
	DefaultAPIBase = "https://api.github.com"
	apiVersion     = "2022-11-28"
	acceptJSON     = "application/vnd.github+json"
	// A release description is a few kilobytes; this only bounds a broken server.
	maxReleaseBody = 1 << 20
	// A request with no User-Agent is refused by GitHub outright.
	headerUserAgent  = "User-Agent"
	headerAccept     = "Accept"
	headerAPIVersion = "X-GitHub-Api-Version"
)

// Source is the repository the app updates from.
type Source struct {
	Client *http.Client
	// APIBase overrides DefaultAPIBase; tests use it.
	APIBase   string
	Owner     string
	Repo      string
	UserAgent string
}

// apiRelease is the subset of GitHub's release object the app reads.
type apiRelease struct {
	TagName     string    `json:"tag_name"`
	Body        string    `json:"body"`
	HTMLURL     string    `json:"html_url"`
	PublishedAt time.Time `json:"published_at"`
	Assets      []struct {
		Name               string `json:"name"`
		Size               int64  `json:"size"`
		BrowserDownloadURL string `json:"browser_download_url"`
		Digest             string `json:"digest"`
	} `json:"assets"`
}

// Latest asks GitHub for the newest non-prerelease release.
func (s Source) Latest(ctx context.Context) (Release, error) {
	base := s.APIBase
	if base == "" {
		base = DefaultAPIBase
	}
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest", strings.TrimSuffix(base, "/"), s.Owner, s.Repo)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return Release{}, err
	}
	req.Header.Set(headerAccept, acceptJSON)
	req.Header.Set(headerAPIVersion, apiVersion)
	req.Header.Set(headerUserAgent, s.UserAgent)
	res, err := s.client().Do(req)
	if err != nil {
		return Release{}, fmt.Errorf("update: check for a release: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return Release{}, ErrNoRelease
	}
	if res.StatusCode != http.StatusOK {
		return Release{}, fmt.Errorf("update: GitHub answered %s", res.Status)
	}
	var raw apiRelease
	if err := json.NewDecoder(io.LimitReader(res.Body, maxReleaseBody)).Decode(&raw); err != nil {
		return Release{}, fmt.Errorf("update: read the release: %w", err)
	}
	return raw.release(), nil
}

func (s Source) client() *http.Client {
	if s.Client != nil {
		return s.Client
	}
	return http.DefaultClient
}

func (r apiRelease) release() Release {
	rel := Release{
		Tag:         r.TagName,
		Version:     strings.TrimPrefix(r.TagName, tagPrefix),
		Notes:       r.Body,
		URL:         r.HTMLURL,
		PublishedAt: r.PublishedAt,
		Assets:      make([]Asset, 0, len(r.Assets)),
	}
	for _, a := range r.Assets {
		rel.Assets = append(rel.Assets, Asset{Name: a.Name, Size: a.Size, URL: a.BrowserDownloadURL, Digest: a.Digest})
	}
	return rel
}
