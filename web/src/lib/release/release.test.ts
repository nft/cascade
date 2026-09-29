import { describe, expect, it } from 'vitest'
import { detectPlatform } from './detect'
import {
  PLATFORM_IDS,
  PLATFORMS,
  RELEASE_FILES,
  checksumsUrl,
  platformDownloads,
  primaryDownloadUrl,
  type PublishedRelease,
} from './platforms'

const asset = (name: string) => ({ name, size: 1, url: `https://dl/${name}`, sha256: null })

const RELEASE: PublishedRelease = {
  version: '0.1.0',
  tag: 'v0.1.0',
  publishedAt: '2026-09-29T12:00:00Z',
  url: 'https://github.com/nft/cascade/releases/tag/v0.1.0',
  assets: [RELEASE_FILES.windowsZip, RELEASE_FILES.windowsSetup, RELEASE_FILES.macosDmg, RELEASE_FILES.checksums].map(
    asset,
  ),
}

describe('platformDownloads', () => {
  it('returns the files the release carries, primary first', () => {
    expect(platformDownloads(RELEASE, 'windows').map((d) => d.asset.name)).toEqual([
      RELEASE_FILES.windowsSetup,
      RELEASE_FILES.windowsZip,
    ])
  })

  it('returns nothing for a platform the release lacks', () => {
    expect(platformDownloads(RELEASE, 'linux')).toEqual([])
  })
})

describe('primaryDownloadUrl', () => {
  it('links the primary asset of a published release', () => {
    expect(primaryDownloadUrl({ status: 'published', release: RELEASE }, 'macos')).toBe(
      `https://dl/${RELEASE_FILES.macosDmg}`,
    )
  })

  it('has nothing to link without a release', () => {
    expect(primaryDownloadUrl({ status: 'none' }, 'macos')).toBeNull()
    expect(primaryDownloadUrl({ status: 'unknown' }, 'macos')).toBeNull()
  })
})

describe('platform table', () => {
  it('gives every platform exactly one primary file', () => {
    for (const id of PLATFORM_IDS) expect(PLATFORMS[id].files.filter((f) => f.primary), id).toHaveLength(1)
  })

  it('finds the checksum file', () => {
    expect(checksumsUrl(RELEASE)).toBe(`https://dl/${RELEASE_FILES.checksums}`)
  })
})

describe('detectPlatform', () => {
  const chrome = (os: string) => `Mozilla/5.0 (${os}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36`

  it.each([
    ['Macintosh; Intel Mac OS X 10_15_7', 'macos'],
    ['Windows NT 10.0; Win64; x64', 'windows'],
    ['X11; Linux x86_64', 'linux'],
    ['X11; CrOS x86_64 14541.0.0', null],
    ['Linux; Android 14; Pixel 8', null],
  ])('reads %s as %s', (os, expected) => {
    expect(detectPlatform({ userAgent: chrome(os) })).toBe(expected)
  })

  it('prefers client hints when the browser sends them', () => {
    expect(detectPlatform({ userAgent: chrome('X11; Linux x86_64'), userAgentData: { platform: 'Windows' } })).toBe(
      'windows',
    )
  })

  it('treats an iPad asking for the desktop site as mobile', () => {
    expect(detectPlatform({ userAgent: chrome('Macintosh; Intel Mac OS X 10_15_7'), maxTouchPoints: 5 })).toBeNull()
  })

  it('does not read Darwin as Windows', () => {
    expect(detectPlatform({ userAgent: 'SomeApp/1.0 CFNetwork/1490 Darwin/23.0.0' })).toBeNull()
  })
})
