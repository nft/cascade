package update

// The file names the release workflow publishes. They are spelled out in the
// env block of .github/workflows/release.yml and in the website's
// web/src/lib/release/platforms.ts; a rename has to land in all three.
const (
	AssetMacOS        = "Cascade-macOS-universal.dmg"
	AssetWindowsSetup = "Cascade-Windows-x64-setup.exe"
	AssetLinux        = "Cascade-Linux-x64.tar.gz"
	AssetChecksums    = "SHA256SUMS.txt"
)

// GOOS and GOARCH values with a published build.
const (
	osDarwin  = "darwin"
	osWindows = "windows"
	osLinux   = "linux"
	archAMD64 = "amd64"
	archARM64 = "arm64"
)

// AssetFor names the release file that installs on the given platform, or
// reports that no build is published for it.
func AssetFor(goos, goarch string) (string, bool) {
	switch goos {
	case osDarwin:
		// The disk image is universal.
		return AssetMacOS, goarch == archAMD64 || goarch == archARM64
	case osWindows:
		// The installer refuses to run under arm64 emulation.
		return AssetWindowsSetup, goarch == archAMD64
	case osLinux:
		return AssetLinux, goarch == archAMD64
	}
	return "", false
}
