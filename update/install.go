package update

import (
	"context"
	"errors"
	"os"
)

// Kind is how a downloaded package is applied on this platform.
type Kind string

const (
	// KindReplaceBundle swaps the running .app for the one in the disk image (macOS).
	KindReplaceBundle Kind = "bundle"
	// KindReplaceBinary writes the new executable over the running one (Linux).
	KindReplaceBinary Kind = "binary"
	// KindRunInstaller hands over to the downloaded installer (Windows).
	KindRunInstaller Kind = "installer"
)

// Plan is what Stage decided about the running installation.
type Plan struct {
	Kind Kind `json:"kind"`
	// Target is the bundle or executable that gets replaced; empty for an installer.
	Target string `json:"target,omitempty"`
	// Relaunch is whether Apply arranges for the new version to start by itself.
	Relaunch bool `json:"relaunch"`
}

var (
	// ErrUnsupported means this platform has no in-app install step.
	ErrUnsupported = errors.New("update: installing in place is not supported on this platform")
	// ErrNotWritable means the installation lives where this user cannot write.
	ErrNotWritable = errors.New("update: the installed copy is not writable by this user")
	// ErrRunningFromImage means Cascade was started from the disk image it shipped on.
	ErrRunningFromImage = errors.New("update: Cascade is running from its disk image; move it to Applications first")
	// ErrTranslocated means Gatekeeper is running the bundle from a read-only copy.
	ErrTranslocated = errors.New("update: macOS is running Cascade from a quarantined copy; move it to Applications and open it from there")
	// ErrNotBundled means the executable is not inside an .app bundle (a bare dev binary).
	ErrNotBundled = errors.New("update: Cascade is not running from an app bundle")
)

// Stage looks at where the running executable lives and decides how a
// package applies there, refusing locations that cannot be updated in place.
func Stage(exe string) (Plan, error) {
	return stage(exe)
}

// Apply installs the downloaded package according to the plan and, where
// the plan says so, arranges for the new version to start once this process
// exits. The caller quits the app afterwards.
func Apply(ctx context.Context, plan Plan, pkg string) error {
	return apply(ctx, plan, pkg)
}

const probePattern = ".cascade-update-*"

// dirWritable tries the one thing that matters: creating a file there.
func dirWritable(dir string) bool {
	f, err := os.CreateTemp(dir, probePattern)
	if err != nil {
		return false
	}
	name := f.Name()
	f.Close()
	os.Remove(name)
	return true
}
