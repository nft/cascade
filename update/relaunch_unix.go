//go:build darwin || linux

package update

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
)

const shell = "/bin/sh"

// waitForExit is the shell preamble every relaunch script starts with: $1 is
// the pid of this process, and nothing below runs until it is gone.
const waitForExit = `while kill -0 "$1" 2>/dev/null; do sleep 0.2; done
`

// spawnAfterExit starts a detached shell that runs script once this process
// has exited. $1 is this pid; args follow as $2, $3, …. The child owns no
// terminal and no pipes, so quitting the app does not take it along.
func spawnAfterExit(script string, args ...string) error {
	argv := append([]string{shell, strconv.Itoa(os.Getpid())}, args...)
	cmd := exec.Command(shell, append([]string{"-c", waitForExit + script}, argv...)...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	cmd.Stdin, cmd.Stdout, cmd.Stderr = nil, nil, nil
	if err := cmd.Start(); err != nil {
		return err
	}
	return cmd.Process.Release()
}
