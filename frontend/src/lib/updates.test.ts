import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UpdateApi } from './api'
import { dialogs } from './dialogs.svelte'
import { BROWSER_APP_INFO, InstallKind, UpdateStatus, type UpdateCheck, type UpdateProgress } from './updates'
import { UpdatesState } from './updates.svelte'

const release = {
  version: '0.2.0',
  tag: 'v0.2.0',
  notes: '### Added\n\n- Auto-update.',
  url: 'https://github.com/nft/cascade/releases/tag/v0.2.0',
  publishedAt: '2026-10-10T12:00:00Z',
  assetName: 'Cascade-macOS-universal.dmg',
  assetSize: 1000,
}

const available: UpdateCheck = {
  status: UpdateStatus.Available,
  release,
  plan: { kind: InstallKind.ReplaceBundle, target: '/Applications/Cascade.app', relaunch: true },
}

function harness(check: UpdateCheck | Error = available) {
  let progressHandler: ((p: UpdateProgress) => void) | null = null
  const api: UpdateApi = {
    appInfo: vi.fn(async () => ({ ...BROWSER_APP_INFO, version: '0.1.0', os: 'darwin', arch: 'arm64' })),
    checkForUpdate: vi.fn(async () => {
      if (check instanceof Error) throw check
      return check
    }),
    downloadUpdate: vi.fn(async () => {}),
    cancelUpdateDownload: vi.fn(async () => {}),
    installUpdate: vi.fn(async () => available.plan!),
    openExternal: vi.fn(async () => {}),
    onUpdateProgress: vi.fn((handler) => {
      progressHandler = handler
      return () => (progressHandler = null)
    }),
  }
  const settings = { checkForUpdates: true, skippedUpdate: '', update: vi.fn() }
  const state = new UpdatesState({ api, settings })
  return { state, api, settings, emit: (p: UpdateProgress) => progressHandler?.(p) }
}

beforeEach(() => {
  dialogs.update = false
})

describe('check', () => {
  it('offers a newer release and remembers the install plan', async () => {
    const { state } = harness()
    await state.check({ manual: false })
    expect(state.phase).toBe('available')
    expect(state.release?.version).toBe('0.2.0')
    expect(state.plan?.kind).toBe(InstallKind.ReplaceBundle)
    expect(state.pending).toBe(true)
    expect(state.installLabel).toBe('Install and relaunch')
  })

  it('reports up to date and no pill when nothing is newer', async () => {
    const { state } = harness({ status: UpdateStatus.UpToDate })
    await state.check({ manual: true })
    expect(state.phase).toBe('upToDate')
    expect(state.pending).toBe(false)
  })

  it('stays quiet about a skipped version on the launch check but not on a manual one', async () => {
    const { state, settings } = harness()
    settings.skippedUpdate = 'v0.2.0'
    await state.check({ manual: false })
    expect(state.phase).toBe('upToDate')
    await state.check({ manual: true })
    expect(state.phase).toBe('available')
  })

  it('keeps a release with no build for this machine as unsupported', async () => {
    const { state } = harness({ status: UpdateStatus.Unsupported, release })
    await state.check({ manual: false })
    expect(state.phase).toBe('unsupported')
    expect(state.pending).toBe(false)
    expect(state.release?.version).toBe('0.2.0')
  })

  it('turns a failing check into a message, not a crash', async () => {
    const { state } = harness(new Error('GitHub answered 502'))
    await state.check({ manual: true })
    expect(state.phase).toBe('failed')
    expect(state.error).toBe('GitHub answered 502')
    state.retry()
    expect(state.phase).toBe('idle')
  })

  it('labels the Windows plan as running the installer', async () => {
    const { state } = harness({ ...available, plan: { kind: InstallKind.RunInstaller, relaunch: false } })
    await state.check({ manual: false })
    expect(state.installLabel).toBe('Run installer')
  })
})

describe('download and install', () => {
  it('tracks progress and ends ready, then installs', async () => {
    const { state, api, emit } = harness()
    await state.check({ manual: false })
    const downloading = state.download()
    expect(state.phase).toBe('downloading')
    emit({ tag: 'v0.2.0', done: 250, total: 1000 })
    expect(state.fraction).toBe(0.25)
    emit({ tag: 'v0.1.0', done: 999, total: 1000 }) // another tag's event is ignored
    expect(state.fraction).toBe(0.25)
    await downloading
    expect(state.phase).toBe('ready')
    expect(state.pending).toBe(true)

    await state.install()
    expect(api.installUpdate).toHaveBeenCalledOnce()
    expect(state.phase).toBe('installing')
  })

  it('refuses to download when installing from here is blocked', async () => {
    const { state, api } = harness({ ...available, plan: undefined, installBlocker: 'Cascade is running from its disk image' })
    await state.check({ manual: false })
    await state.download()
    expect(api.downloadUpdate).not.toHaveBeenCalled()
    expect(state.phase).toBe('available')
  })

  it('goes back to available when the user cancels', async () => {
    const { state, api } = harness()
    ;(api.downloadUpdate as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((_, reject) => setTimeout(() => reject(new Error('download: context canceled')), 0)),
    )
    await state.check({ manual: false })
    const downloading = state.download()
    await state.cancelDownload()
    await downloading
    expect(api.cancelUpdateDownload).toHaveBeenCalledOnce()
    expect(state.phase).toBe('available')
    expect(state.error).toBe('')
  })

  it('reports a checksum failure and lets the user retry', async () => {
    const { state, api } = harness()
    ;(api.downloadUpdate as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('the download does not match its published checksum'),
    )
    await state.check({ manual: false })
    await state.download()
    expect(state.phase).toBe('failed')
    expect(state.error).toContain('checksum')
    state.retry()
    expect(state.phase).toBe('available')
  })
})

describe('skip, later and links', () => {
  it('skip remembers the tag and closes the dialog; later only dismisses', async () => {
    const { state, settings } = harness()
    await state.check({ manual: false })
    state.openDialog()
    expect(dialogs.update).toBe(true)
    state.skip()
    expect(settings.update).toHaveBeenCalledWith({ skippedUpdate: 'v0.2.0' })
    expect(dialogs.update).toBe(false)
    expect(state.pending).toBe(false)

    await state.check({ manual: true })
    expect(state.pending).toBe(true)
    state.later()
    expect(state.pending).toBe(false)
    expect(settings.update).toHaveBeenCalledOnce()
  })

  it('opens the release page, or the releases list without a release', async () => {
    const { state, api } = harness()
    state.openReleasePage()
    expect(api.openExternal).toHaveBeenLastCalledWith(BROWSER_APP_INFO.releasesUrl)
    await state.check({ manual: false })
    state.openReleasePage()
    expect(api.openExternal).toHaveBeenLastCalledWith(release.url)
  })

  it('loads the build info', async () => {
    const { state } = harness()
    await state.loadInfo()
    expect(state.info.version).toBe('0.1.0')
  })
})

describe('scheduleStartupCheck', () => {
  it('checks after the delay unless the setting is off', async () => {
    vi.useFakeTimers()
    try {
      const { state, api } = harness()
      state.scheduleStartupCheck(50)
      await vi.advanceTimersByTimeAsync(50)
      expect(api.checkForUpdate).toHaveBeenCalledOnce()

      const quiet = harness()
      quiet.settings.checkForUpdates = false
      quiet.state.scheduleStartupCheck(50)
      await vi.advanceTimersByTimeAsync(50)
      expect(quiet.api.checkForUpdate).not.toHaveBeenCalled()

      const cancelled = harness()
      cancelled.state.scheduleStartupCheck(50)()
      await vi.advanceTimersByTimeAsync(50)
      expect(cancelled.api.checkForUpdate).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
