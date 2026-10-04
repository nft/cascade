// The update wire protocol: what the Go side reports about releases and the
// progress event it streams while downloading. Every type mirrors a DTO in
// app_update.go; the status and plan values are the Go constants verbatim.
import { EventsOn } from '../../wailsjs/runtime/runtime'

/** The Wails event carrying download progress (main.UpdateProgressEvent). */
export const UPDATE_PROGRESS_EVENT = 'update:progress'

/** What a check concluded (main.UpdateUpToDate / UpdateAvailable / UpdateUnsupported). */
export const UpdateStatus = {
  UpToDate: 'upToDate',
  Available: 'available',
  Unsupported: 'unsupported',
} as const
export type UpdateStatus = (typeof UpdateStatus)[keyof typeof UpdateStatus]

/** How an install applies on this machine (update.Kind). */
export const InstallKind = {
  /** macOS: the running .app is swapped for the one in the disk image. */
  ReplaceBundle: 'bundle',
  /** Linux: the executable is replaced in place. */
  ReplaceBinary: 'binary',
  /** Windows: the downloaded installer takes over. */
  RunInstaller: 'installer',
} as const
export type InstallKind = (typeof InstallKind)[keyof typeof InstallKind]

export interface AppInfo {
  version: string
  os: string
  arch: string
  releasesUrl: string
  websiteUrl: string
  newIssueUrl: string
}

export interface UpdateRelease {
  version: string
  tag: string
  notes: string
  url: string
  /** RFC 3339, as Go serializes time.Time. */
  publishedAt: string
  assetName?: string
  assetSize?: number
}

export interface UpdatePlan {
  kind: InstallKind
  target?: string
  relaunch: boolean
}

export interface UpdateCheck {
  status: UpdateStatus
  release?: UpdateRelease
  plan?: UpdatePlan
  /** Why an install cannot happen from where Cascade runs; empty when it can. */
  installBlocker?: string
}

export interface UpdateProgress {
  tag: string
  done: number
  /** -1 when the server did not say. */
  total: number
}

/** Stand-in AppInfo for vitest and plain-browser dev, where there is no Go side. */
export const BROWSER_APP_INFO: AppInfo = {
  version: 'dev',
  os: 'browser',
  arch: '',
  releasesUrl: 'https://github.com/nft/cascade/releases',
  websiteUrl: 'https://nft.github.io/cascade',
  newIssueUrl: 'https://github.com/nft/cascade/issues/new',
}

/** Subscribes to download progress; a no-op outside the Wails runtime. */
export function subscribeUpdateProgress(handler: (progress: UpdateProgress) => void): () => void {
  if (typeof window === 'undefined' || window.go === undefined) return () => {}
  return EventsOn(UPDATE_PROGRESS_EVENT, (progress: UpdateProgress) => handler(progress))
}

const PLATFORM_LABELS: Record<string, string> = {
  darwin: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
  browser: 'browser',
}

/** "macOS (arm64)" from Go's GOOS/GOARCH. */
export function platformLabel(info: AppInfo): string {
  const os = PLATFORM_LABELS[info.os] ?? info.os
  return info.arch ? `${os} (${info.arch})` : os
}
