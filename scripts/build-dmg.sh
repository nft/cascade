#!/usr/bin/env bash
# Builds Cascade as a universal macOS app and packs it into a disk image with
# an Applications shortcut to drag it onto. The release workflow runs this
# too, with the signing settings below.
#
# Usage: scripts/build-dmg.sh [output.dmg]   (default: build/bin/Cascade-macOS-universal.dmg)
#
# The app gets an ad-hoc signature unless MACOS_SIGN_IDENTITY names a Developer
# ID Application identity of Cascade's team (its SHA-1 when several share a
# name); then the app and the image are signed with it. NOTARY_KEY_PATH,
# NOTARY_KEY_ID and NOTARY_ISSUER_ID, an App Store Connect API key, also get
# the image notarized and the ticket stapled to it. Releases do both.
set -euo pipefail

if [[ "$(uname -s)" != Darwin ]]; then
  echo "build-dmg.sh needs macOS: it signs with codesign and packs with hdiutil" >&2
  exit 1
fi

# Every Developer ID signature carries the team, so it is no secret.
readonly team_id=CD9FYC6QYJ
# Apple usually answers within minutes; this only bounds an outage.
readonly notary_timeout=1h

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/build/bin/Cascade-macOS-universal.dmg}"
[[ "$out" == /* ]] || out="$PWD/$out"
readonly root out
readonly app=build/bin/Cascade.app
# The image's contents are staged where the next `wails build -clean` sweeps
# them up, not in a temp dir removed by an EXIT trap: with a trap set, macOS's
# bash 3.2 exits 0 after an unbound variable, which would pass a failed build.
readonly staging=build/bin/dmg
readonly identity="${MACOS_SIGN_IDENTITY:-}"
readonly notary_key="${NOTARY_KEY_PATH:-}"

# Rejects a half-configured notarization before the build, not after it.
check_settings() {
  [[ -n "$notary_key" ]] || return 0
  if [[ -z "${NOTARY_KEY_ID:-}" || -z "${NOTARY_ISSUER_ID:-}" ]]; then
    echo "NOTARY_KEY_PATH needs NOTARY_KEY_ID and NOTARY_ISSUER_ID as well" >&2
    exit 1
  fi
  if [[ -z "$identity" ]]; then
    echo "notarizing needs MACOS_SIGN_IDENTITY: Apple rejects ad-hoc signatures" >&2
    exit 1
  fi
}

# A certificate from another team would otherwise only fail at notarization.
check_team() {
  local team
  team="$(codesign --display --verbose=2 "$1" 2>&1 | sed -n 's/^TeamIdentifier=//p')"
  if [[ "$team" != "$team_id" ]]; then
    echo "$1 is signed by team ${team:-none}, not Cascade's $team_id" >&2
    exit 1
  fi
}

sign_app() {
  if [[ -z "$identity" ]]; then
    # An ad-hoc signature over the whole bundle lets Apple silicon Macs offer
    # Open Anyway instead of reporting the app as damaged.
    codesign --force --deep --sign - "$app"
    return
  fi
  # Notarization requires the hardened runtime and a secure timestamp.
  codesign --force --options runtime --timestamp --sign "$identity" "$app"
  codesign --verify --strict "$app"
  check_team "$app"
}

pack_dmg() {
  rm -rf "$staging"
  mkdir -p "$staging" "$(dirname "$out")"
  cp -R "$app" "$staging/"
  ln -s /Applications "$staging/Applications"
  hdiutil create -volname Cascade -srcfolder "$staging" -ov -format UDZO "$out"
  rm -rf "$staging"
  if [[ -n "$identity" ]]; then
    codesign --force --timestamp --sign "$identity" "$out"
    check_team "$out"
  fi
}

# Prints one field of notarytool's JSON output, or nothing.
json_field() {
  plutil -extract "$1" raw -o - - 2>/dev/null || true
}

notarize_dmg() {
  [[ -n "$notary_key" ]] || return 0
  local auth=(--key "$notary_key" --key-id "$NOTARY_KEY_ID" --issuer "$NOTARY_ISSUER_ID")
  local result status id
  # Kept going on failure, so that Apple's log gets printed below.
  result="$(xcrun notarytool submit "$out" "${auth[@]}" --wait --timeout "$notary_timeout" --output-format json)" || true
  status="$(json_field status <<<"$result")"
  if [[ "$status" != Accepted ]]; then
    echo "Notarization did not succeed (${status:-no status}): $result" >&2
    id="$(json_field id <<<"$result")"
    [[ -z "$id" ]] || xcrun notarytool log "$id" "${auth[@]}" >&2
    exit 1
  fi
  xcrun stapler staple "$out"
  # Gatekeeper's verdict on the image as a user downloads it.
  spctl --assess --type open --context context:primary-signature --verbose=2 "$out"
}

cd "$root"
check_settings

# The bindings in frontend/wailsjs are committed. Regenerating them would run
# main(), whose store bootstrap and keychain probe touch the real data folder.
wails build -clean -trimpath -skipbindings -platform darwin/universal

sign_app
pack_dmg
notarize_dmg
echo "Disk image: $out"
