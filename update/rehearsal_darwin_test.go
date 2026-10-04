//go:build darwin

package update

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// rehearsalEnv names a real, signed Cascade disk image. The test below only
// runs when it is set, since it needs a release artifact:
//
//	CASCADE_UPDATE_REHEARSAL_DMG=path/to/Cascade-macOS-universal.dmg go test ./update -run Rehearsal -v
const rehearsalEnv = "CASCADE_UPDATE_REHEARSAL_DMG"

// TestApplyRehearsal swaps a stand-in bundle for the app inside a real disk
// image, the way InstallUpdate does to the running app: mount, verify the
// signature, move the old bundle aside, copy the new one in. The relaunch it
// schedules waits for this process to exit and then finds nothing to open,
// because the temp dir is gone by then.
func TestApplyRehearsal(t *testing.T) {
	dmg := os.Getenv(rehearsalEnv)
	if dmg == "" {
		t.Skipf("%s is not set", rehearsalEnv)
	}
	dir := t.TempDir()
	target := filepath.Join(dir, "Cascade"+bundleSuffix)
	exe := filepath.Join(target, "Contents", "MacOS", "Cascade")
	if err := os.MkdirAll(filepath.Dir(exe), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(exe, []byte("old build"), executableMode); err != nil {
		t.Fatal(err)
	}

	plan, err := Stage(exe)
	if err != nil || plan.Kind != KindReplaceBundle || plan.Target != target {
		t.Fatalf("Stage = %+v, %v", plan, err)
	}
	if err := Apply(context.Background(), plan, dmg); err != nil {
		t.Fatalf("Apply: %v", err)
	}

	if out, err := exec.Command("codesign", "--verify", "--deep", "--strict", target).CombinedOutput(); err != nil {
		t.Fatalf("the installed bundle does not verify: %v: %s", err, out)
	}
	info, err := exec.Command("plutil", "-extract", "CFBundleShortVersionString", "raw", filepath.Join(target, "Contents", "Info.plist")).Output()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ParseVersion(strings.TrimSpace(string(info))); err != nil {
		t.Errorf("installed bundle version %q: %v", info, err)
	}
	if body, _ := os.ReadFile(exe); string(body) == "old build" {
		t.Error("the executable was not replaced")
	}
	previous := filepath.Join(dir, previousBundleName)
	if old, err := os.ReadFile(filepath.Join(previous, "Contents", "MacOS", "Cascade")); err != nil || string(old) != "old build" {
		t.Errorf("the old bundle was not kept aside for rollback: %v", err)
	}
	t.Logf("installed version %s over the stand-in", strings.TrimSpace(string(info)))
}
