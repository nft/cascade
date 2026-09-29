#!/usr/bin/env bash
# Builds Cascade as a universal macOS app and packs it into a disk image with
# an Applications shortcut to drag it onto. The release workflow runs this
# too, so a local image matches the published one.
#
# Usage: scripts/build-dmg.sh [output.dmg]   (default: build/bin/Cascade-macOS-universal.dmg)
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  echo "build-dmg.sh needs macOS: it signs with codesign and packs with hdiutil" >&2
  exit 1
fi

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/build/bin/Cascade-macOS-universal.dmg}"
[[ "$out" == /* ]] || out="$PWD/$out"
readonly root out
readonly app=build/bin/Cascade.app

cd "$root"

# The bindings in frontend/wailsjs are committed. Regenerating them would run
# main(), whose store bootstrap and keychain probe touch the real data folder.
wails build -clean -trimpath -skipbindings -platform darwin/universal

# There is no Developer ID yet. An ad-hoc signature over the whole bundle lets
# Apple silicon Macs offer Open Anyway instead of reporting the app as damaged.
codesign --force --deep --sign - "$app"

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp -R "$app" "$staging/"
ln -s /Applications "$staging/Applications"

mkdir -p "$(dirname "$out")"
hdiutil create -volname Cascade -srcfolder "$staging" -ov -format UDZO "$out"
echo "Disk image: $out"
