package update

import (
	"bufio"
	"path/filepath"
	"strings"
)

// macOS bundle layout and the signing identity a replacement must carry. The
// team is the one scripts/build-dmg.sh refuses to sign without; the bundle
// identifier is CFBundleIdentifier in build/darwin/Info.plist.
const (
	bundleSuffix          = ".app"
	bundleExecutableDepth = 3 // Contents/MacOS/<exe> sits three levels under the bundle
	bundleIdentifier      = "io.github.nft.cascade"
	bundleTeamID          = "CD9FYC6QYJ"
	diskImageRoot         = "/Volumes/"
	translocationMarker   = "/AppTranslocation/"
	// Keys in `codesign --display --verbose=2` output.
	codesignIdentifierKey = "Identifier="
	codesignTeamKey       = "TeamIdentifier="
)

// bundleFromExecutable walks from Cascade.app/Contents/MacOS/Cascade up to
// the bundle directory.
func bundleFromExecutable(exe string) (string, error) {
	dir := exe
	for range bundleExecutableDepth {
		dir = filepath.Dir(dir)
	}
	if !strings.HasSuffix(dir, bundleSuffix) {
		return "", ErrNotBundled
	}
	return dir, nil
}

func isOnDiskImage(path string) bool {
	return strings.HasPrefix(path, diskImageRoot)
}

func isTranslocated(path string) bool {
	return strings.Contains(path, translocationMarker)
}

// codesignInfo is what `codesign --display` says about a bundle.
type codesignInfo struct {
	Identifier string
	TeamID     string
}

func parseCodesignInfo(output string) codesignInfo {
	var info codesignInfo
	scanner := bufio.NewScanner(strings.NewReader(output))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if v, ok := strings.CutPrefix(line, codesignIdentifierKey); ok {
			info.Identifier = v
		} else if v, ok := strings.CutPrefix(line, codesignTeamKey); ok {
			info.TeamID = v
		}
	}
	return info
}

// signedByCascade is the authenticity check: the same bundle identifier and
// the same Developer ID team that every release is signed with.
func (c codesignInfo) signedByCascade() bool {
	return c.Identifier == bundleIdentifier && c.TeamID == bundleTeamID
}
