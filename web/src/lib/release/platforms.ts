import type { IconName } from '$lib/icons'

export const PLATFORM_IDS = ['macos', 'windows', 'linux'] as const
export type PlatformId = (typeof PLATFORM_IDS)[number]

/**
 * Asset names the release workflow uploads. .github/workflows/release.yml
 * writes the same names; change both together or the download buttons break.
 */
export const RELEASE_FILES = {
  macosDmg: 'Cascade-macOS-universal.dmg',
  windowsSetup: 'Cascade-Windows-x64-setup.exe',
  windowsZip: 'Cascade-Windows-x64.zip',
  linuxTar: 'Cascade-Linux-x64.tar.gz',
  checksums: 'SHA256SUMS.txt',
} as const

export interface PlatformFile {
  name: string
  /** What the file is, shown on its button. */
  label: string
  primary: boolean
}

export interface Platform {
  id: PlatformId
  name: string
  icon: IconName
  /** Architectures the primary file runs on. */
  arch: string
  requirements: string
  files: readonly PlatformFile[]
}

export const PLATFORMS: Record<PlatformId, Platform> = {
  macos: {
    id: 'macos',
    name: 'macOS',
    icon: 'laptop_mac',
    arch: 'Universal: Apple silicon and Intel',
    requirements: 'macOS 12 Monterey or later',
    files: [{ name: RELEASE_FILES.macosDmg, label: 'Disk image', primary: true }],
  },
  windows: {
    id: 'windows',
    name: 'Windows',
    icon: 'desktop_windows',
    arch: '64-bit (x64)',
    requirements: 'Windows 10 or 11 with the WebView2 runtime, which the installer adds if missing',
    files: [
      { name: RELEASE_FILES.windowsSetup, label: 'Installer', primary: true },
      { name: RELEASE_FILES.windowsZip, label: 'Portable zip', primary: false },
    ],
  },
  linux: {
    id: 'linux',
    name: 'Linux',
    icon: 'terminal',
    arch: '64-bit (x86-64)',
    requirements: 'GTK 3 and WebKitGTK 4.1, as on Ubuntu 24.04, Debian 12 or Fedora 40',
    files: [{ name: RELEASE_FILES.linuxTar, label: 'Tarball', primary: true }],
  },
}

export interface ReleaseAsset {
  name: string
  size: number
  url: string
  /** Hex digest, when GitHub reports one for the asset. */
  sha256: string | null
}

export interface PublishedRelease {
  version: string
  tag: string
  publishedAt: string
  url: string
  assets: ReleaseAsset[]
}

/**
 * What the build learned about releases: `none` means GitHub answered and
 * there is no release yet; `unknown` means it could not ask (offline, rate
 * limited, or a private repository without a token).
 */
export type ReleaseState =
  | { status: 'published'; release: PublishedRelease }
  | { status: 'none' }
  | { status: 'unknown' }

export interface PlatformDownload {
  file: PlatformFile
  asset: ReleaseAsset
}

/** The platform's files that the release actually carries, primary first. */
export function platformDownloads(release: PublishedRelease, platform: PlatformId): PlatformDownload[] {
  const byName = new Map(release.assets.map((asset) => [asset.name, asset]))
  return PLATFORMS[platform].files
    .flatMap((file) => {
      const asset = byName.get(file.name)
      return asset ? [{ file, asset }] : []
    })
    .sort((a, b) => Number(b.file.primary) - Number(a.file.primary))
}

/** Direct link to the platform's main file, or null when there is none to link. */
export function primaryDownloadUrl(state: ReleaseState, platform: PlatformId): string | null {
  if (state.status !== 'published') return null
  return platformDownloads(state.release, platform)[0]?.asset.url ?? null
}

export function checksumsUrl(release: PublishedRelease): string | null {
  return release.assets.find((asset) => asset.name === RELEASE_FILES.checksums)?.url ?? null
}
