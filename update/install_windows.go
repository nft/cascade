//go:build windows

package update

import (
	"context"
	"fmt"
	"os/exec"
	"syscall"
)

// The installer's manifest asks for administrator rights, which CreateProcess
// refuses outright; `start` goes through ShellExecute and gets the UAC prompt.
const (
	commandShell = "cmd"
	shellRunFlag = "/C"
	shellStart   = "start"
	// start takes an optional window title first; an empty one keeps the
	// quoted path from being read as the title.
	emptyWindowTitle = ""
)

func stage(string) (Plan, error) {
	// The installer picks the location; the running copy is whatever it finds there.
	return Plan{Kind: KindRunInstaller}, nil
}

func apply(_ context.Context, _ Plan, installer string) error {
	cmd := exec.Command(commandShell, shellRunFlag, shellStart, emptyWindowTitle, installer)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("update: start the installer: %w", err)
	}
	return cmd.Process.Release()
}
