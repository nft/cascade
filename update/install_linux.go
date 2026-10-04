//go:build linux

package update

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

// After this process exits: start the executable that replaced it.
const linuxRelaunchScript = `exec "$2"
`

func stage(exe string) (Plan, error) {
	if !dirWritable(filepath.Dir(exe)) {
		return Plan{}, ErrNotWritable
	}
	return Plan{Kind: KindReplaceBinary, Target: exe, Relaunch: true}, nil
}

func apply(_ context.Context, plan Plan, tarball string) error {
	f, err := os.Open(tarball)
	if err != nil {
		return err
	}
	defer f.Close()
	staged := plan.Target + newSuffix
	if err := extractBinary(f, filepath.Base(plan.Target), staged); err != nil {
		return err
	}
	// Renaming over a running executable is fine: the process keeps its
	// mapped inode and the next start picks up the new file.
	if err := os.Rename(staged, plan.Target); err != nil {
		os.Remove(staged)
		return fmt.Errorf("update: replace the executable: %w", err)
	}
	return spawnAfterExit(linuxRelaunchScript, plan.Target)
}
