package update

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// Progress reports bytes received so far; total is -1 when the server did not
// say how many to expect.
type Progress func(done, total int64)

const (
	// partSuffix marks a download still in flight, so a crash never leaves a
	// complete-looking file behind.
	partSuffix = ".part"
	// Written files are private to the user; the directory is theirs too.
	downloadFileMode = 0o644
	downloadDirMode  = 0o755
	// sha256sum prints "<hex>  <name>"; a leading * marks binary mode.
	sumsFieldCount   = 2
	sumsBinaryMarker = "*"
	digestPrefix     = "sha256:"
	// A checksum list for a handful of files; bounds a broken server only.
	maxSumsBody = 64 << 10
	unknownSize = -1
)

// ErrChecksumMismatch means the downloaded bytes are not what the release
// published. The file is removed before it is returned.
var ErrChecksumMismatch = errors.New("update: the download does not match its published checksum")

// Download streams url into dst, reporting progress, and only gives dst its
// final name once every byte is on disk.
func Download(ctx context.Context, client *http.Client, url, dst string, onProgress Progress) error {
	if err := os.MkdirAll(filepath.Dir(dst), downloadDirMode); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	res, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("update: download: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return fmt.Errorf("update: download answered %s", res.Status)
	}
	part := dst + partSuffix
	if err := writePart(part, res.Body, res.ContentLength, onProgress); err != nil {
		os.Remove(part)
		return err
	}
	return os.Rename(part, dst)
}

func writePart(part string, body io.Reader, total int64, onProgress Progress) error {
	f, err := os.OpenFile(part, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, downloadFileMode)
	if err != nil {
		return err
	}
	counter := &progressWriter{w: f, total: total, report: onProgress}
	if _, err := io.Copy(counter, body); err != nil {
		f.Close()
		return fmt.Errorf("update: download: %w", err)
	}
	return f.Close()
}

type progressWriter struct {
	w      io.Writer
	done   int64
	total  int64
	report Progress
}

func (p *progressWriter) Write(b []byte) (int, error) {
	n, err := p.w.Write(b)
	p.done += int64(n)
	if p.report != nil {
		p.report(p.done, p.total)
	}
	return n, err
}

// FileSHA256 hashes a file and returns the lowercase hex digest.
func FileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// ParseSums reads sha256sum output into name → lowercase hex digest.
func ParseSums(r io.Reader) (map[string]string, error) {
	sums := map[string]string{}
	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != sumsFieldCount {
			return nil, fmt.Errorf("update: checksum line %q is not <sha256>  <file>", line)
		}
		name := strings.TrimPrefix(fields[1], sumsBinaryMarker)
		sums[name] = strings.ToLower(fields[0])
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return sums, nil
}

// FetchSums downloads and parses the release's SHA256SUMS.txt.
func FetchSums(ctx context.Context, client *http.Client, url string) (map[string]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("update: fetch checksums: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("update: checksums answered %s", res.Status)
	}
	return ParseSums(io.LimitReader(res.Body, maxSumsBody))
}

// Verify checks a downloaded file against the release's checksum list and,
// when GitHub supplied one, against the asset's own digest. A mismatch
// deletes the file so a later install step can never pick it up.
func Verify(path, name string, sums map[string]string, digest string) error {
	want, ok := sums[name]
	if !ok {
		return fmt.Errorf("update: %s is not listed in %s", name, AssetChecksums)
	}
	got, err := FileSHA256(path)
	if err != nil {
		return err
	}
	if got != want || (digest != "" && digestPrefix+got != strings.ToLower(digest)) {
		os.Remove(path)
		return ErrChecksumMismatch
	}
	return nil
}
