// Asks GitHub for the latest release while the site prerenders, so download
// buttons, sizes and checksums are baked into the HTML. Any failure degrades
// to a state the pages can still render; a build never fails on it.
import { readFile } from 'node:fs/promises'
import { REPO_NAME, REPO_OWNER } from '$lib/config/site'
import type { PublishedRelease, ReleaseState } from '$lib/release/platforms'

const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
const API_VERSION = '2022-11-28'
const USER_AGENT = 'cascade-website-build'
const REQUEST_TIMEOUT_MS = 8000
const HTTP_NOT_FOUND = 404
const SHA256_PREFIX = 'sha256:'

// Env names are read from process.env: $env/dynamic cannot be read while
// prerendering, and $env/static would fail the build when they are unset.
/** CI passes the workflow token, which also covers a private repository. */
const TOKEN_ENV = 'GITHUB_TOKEN'
/** Path to a saved API response, for previewing the published state locally. */
const FIXTURE_ENV = 'RELEASE_FIXTURE'

interface ApiAsset {
  name: string
  size: number
  browser_download_url: string
  digest?: string | null
}

interface ApiRelease {
  tag_name: string
  published_at: string
  html_url: string
  assets: ApiAsset[]
}

let cached: Promise<ReleaseState> | undefined

/** Memoised: every prerendered page asks, but the build only calls GitHub once. */
export function latestRelease(): Promise<ReleaseState> {
  cached ??= fetchLatestRelease()
  return cached
}

async function fetchLatestRelease(): Promise<ReleaseState> {
  const fixture = process.env[FIXTURE_ENV]
  if (fixture) return published(JSON.parse(await readFile(fixture, 'utf8')) as ApiRelease)

  const token = process.env[TOKEN_ENV]
  try {
    const response = await fetch(LATEST_RELEASE_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': USER_AGENT,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (response.status === HTTP_NOT_FOUND) return token ? { status: 'none' } : { status: 'unknown' }
    if (!response.ok) return { status: 'unknown' }
    return published((await response.json()) as ApiRelease)
  } catch {
    return { status: 'unknown' }
  }
}

function published(api: ApiRelease): ReleaseState {
  const release: PublishedRelease = {
    version: api.tag_name.replace(/^v/, ''),
    tag: api.tag_name,
    publishedAt: api.published_at,
    url: api.html_url,
    assets: api.assets.map((asset) => ({
      name: asset.name,
      size: asset.size,
      url: asset.browser_download_url,
      sha256: asset.digest?.startsWith(SHA256_PREFIX) ? asset.digest.slice(SHA256_PREFIX.length) : null,
    })),
  }
  return { status: 'published', release }
}
