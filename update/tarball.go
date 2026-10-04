package update

import (
	"archive/tar"
	"compress/gzip"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
)

// The Linux tarball is one folder holding the executable and LICENSE.
const (
	executableMode = 0o755
	// newSuffix marks the replacement written next to the running binary
	// before the rename that puts it in place.
	newSuffix = ".new"
)

var errBinaryNotInTarball = errors.New("update: the tarball holds no executable of that name")

// extractBinary writes the regular file named name (at any depth) from a
// gzipped tarball to dst, executable.
func extractBinary(r io.Reader, name, dst string) error {
	gz, err := gzip.NewReader(r)
	if err != nil {
		return fmt.Errorf("update: open the tarball: %w", err)
	}
	defer gz.Close()
	archive := tar.NewReader(gz)
	for {
		header, err := archive.Next()
		if errors.Is(err, io.EOF) {
			return errBinaryNotInTarball
		}
		if err != nil {
			return fmt.Errorf("update: read the tarball: %w", err)
		}
		if header.Typeflag != tar.TypeReg || path.Base(header.Name) != name {
			continue
		}
		return writeExecutable(dst, archive)
	}
}

func writeExecutable(dst string, r io.Reader) error {
	f, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, executableMode)
	if err != nil {
		return err
	}
	if _, err := io.Copy(f, r); err != nil {
		f.Close()
		os.Remove(dst)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(dst)
		return err
	}
	// umask may have narrowed the create mode.
	return os.Chmod(dst, executableMode)
}
