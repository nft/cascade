// Build-time only: pages are prerendered, so this runs once per build and the
// markdown never reaches the browser.
import changelogMarkdown from '$repo/CHANGELOG.md?raw'
import { hasContent, parseChangelog, type ChangelogRelease } from '$lib/changelog/parse'

/** Releases with something to show, newest first as the file lists them. */
export function loadChangelog(): ChangelogRelease[] {
  return parseChangelog(changelogMarkdown).filter(hasContent)
}

/** The newest shipped release, skipping the Unreleased section. */
export function latestChangelogRelease(): ChangelogRelease | null {
  return loadChangelog().find((release) => !release.unreleased) ?? null
}
