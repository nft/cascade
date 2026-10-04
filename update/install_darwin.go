//go:build darwin

package update

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

const (
	// The running bundle is renamed to this beside itself until the new one
	// is running, so a failed copy can be rolled back.
	previousBundleName = ".Cascade.app.previous"
	mountPattern       = "cascade-update-mount-*"
)

// After this process exits: drop the old bundle, open the new one.
const darwinRelaunchScript = `rm -rf "$2"
open "$3"
`

func stage(exe string) (Plan, error) {
	switch {
	case isOnDiskImage(exe):
		return Plan{}, ErrRunningFromImage
	case isTranslocated(exe):
		return Plan{}, ErrTranslocated
	}
	bundle, err := bundleFromExecutable(exe)
	if err != nil {
		return Plan{}, err
	}
	if !dirWritable(filepath.Dir(bundle)) {
		return Plan{}, ErrNotWritable
	}
	return Plan{Kind: KindReplaceBundle, Target: bundle, Relaunch: true}, nil
}

func apply(ctx context.Context, plan Plan, dmg string) error {
	mount, err := os.MkdirTemp("", mountPattern)
	if err != nil {
		return err
	}
	defer os.Remove(mount)
	if err := run(ctx, "hdiutil", "attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount, dmg); err != nil {
		return fmt.Errorf("update: open the disk image: %w", err)
	}
	defer detach(mount)

	app, err := bundleInImage(mount)
	if err != nil {
		return err
	}
	if err := verifySignature(ctx, app); err != nil {
		return err
	}
	if err := swapBundle(ctx, app, plan.Target); err != nil {
		return err
	}
	previous := filepath.Join(filepath.Dir(plan.Target), previousBundleName)
	return spawnAfterExit(darwinRelaunchScript, previous, plan.Target)
}

func bundleInImage(mount string) (string, error) {
	matches, err := filepath.Glob(filepath.Join(mount, "*"+bundleSuffix))
	if err != nil {
		return "", err
	}
	if len(matches) != 1 {
		return "", fmt.Errorf("update: the disk image holds %d app bundles, expected one", len(matches))
	}
	return matches[0], nil
}

// verifySignature is the authenticity check: a valid, strict signature from
// Cascade's own team on Cascade's own bundle identifier.
func verifySignature(ctx context.Context, app string) error {
	if err := run(ctx, "codesign", "--verify", "--deep", "--strict", app); err != nil {
		return fmt.Errorf("update: the downloaded app's signature does not verify: %w", err)
	}
	out, err := exec.CommandContext(ctx, "codesign", "--display", "--verbose=2", app).CombinedOutput()
	if err != nil {
		return fmt.Errorf("update: read the downloaded app's signature: %w", err)
	}
	if info := parseCodesignInfo(string(out)); !info.signedByCascade() {
		return fmt.Errorf("update: the downloaded app is signed as %q by team %q, not Cascade", info.Identifier, info.TeamID)
	}
	return nil
}

// swapBundle moves the running bundle aside and copies the new one into its
// place; the copy failing puts the old bundle back.
func swapBundle(ctx context.Context, app, target string) error {
	previous := filepath.Join(filepath.Dir(target), previousBundleName)
	if err := os.RemoveAll(previous); err != nil {
		return err
	}
	if err := os.Rename(target, previous); err != nil {
		return fmt.Errorf("update: move the current app aside: %w", err)
	}
	// ditto keeps the extended attributes and resource forks the signature covers.
	if err := run(ctx, "ditto", app, target); err != nil {
		os.RemoveAll(target)
		return errors.Join(fmt.Errorf("update: copy the new app into place: %w", err), os.Rename(previous, target))
	}
	return nil
}

func detach(mount string) {
	if err := run(context.Background(), "hdiutil", "detach", mount); err != nil {
		_ = run(context.Background(), "hdiutil", "detach", "-force", mount)
	}
}

func run(ctx context.Context, name string, args ...string) error {
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %w: %s", name, err, string(out))
	}
	return nil
}
