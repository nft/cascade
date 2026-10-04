import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { dialogs } from '../../dialogs.svelte'
import { settings } from '../../settings.svelte'
import type { UpdateProgress } from '../../updates'
import { updates } from '../../updates.svelte'
import UpdateDialog from './UpdateDialog.svelte'

const release = {
  version: '9.0.0',
  tag: 'v9.0.0',
  notes: '### Added\n\n- Something `new`.\n',
  url: 'https://github.com/nft/cascade/releases/tag/v9.0.0',
  publishedAt: '2026-10-10T12:00:00Z',
  assetName: 'Cascade-macOS-universal.dmg',
  assetSize: 2048,
}

let instance: ReturnType<typeof mount> | null = null
let progressHandler: ((p: UpdateProgress) => void) | null = null

const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text)
const dialogText = () => document.querySelector('[role="dialog"]')?.textContent ?? ''

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}

async function openWith(check: Awaited<ReturnType<typeof api.checkForUpdate>>) {
  vi.spyOn(api, 'checkForUpdate').mockResolvedValue(check)
  await updates.check({ manual: true })
  updates.openDialog()
  instance = mount(UpdateDialog, { target: document.body })
  flushSync()
}

beforeEach(() => {
  localStorage.clear()
  settings.reset()
  vi.spyOn(api, 'onUpdateProgress').mockImplementation((handler) => {
    progressHandler = handler
    return () => (progressHandler = null)
  })
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.update = false
  updates.later()
  updates.retry()
  vi.restoreAllMocks()
})

describe('UpdateDialog', () => {
  it('presents the release and its notes, then downloads and offers the install', async () => {
    let finish: () => void = () => {}
    vi.spyOn(api, 'downloadUpdate').mockImplementation(() => new Promise((resolve) => (finish = resolve)))
    await openWith({ status: 'available', release, plan: { kind: 'bundle', relaunch: true } })

    expect(dialogText()).toContain('Cascade 9.0.0')
    expect(dialogText()).toContain('2.0 KB')
    expect(document.querySelector('[aria-label="Release notes"] code')?.textContent).toBe('new')
    expect(buttonByText('Skip this version')).toBeDefined()

    buttonByText('Download and install')!.click()
    flushSync()
    expect(api.downloadUpdate).toHaveBeenCalledWith('v9.0.0')
    progressHandler?.({ tag: 'v9.0.0', done: 1024, total: 2048 })
    flushSync()
    const bar = document.querySelector('[role="progressbar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('50')
    expect(dialogText()).toContain('1.0 KB of 2.0 KB')

    finish()
    await settle()
    expect(dialogText()).toContain('Downloaded and verified')
    expect(buttonByText('Install and relaunch')).toBeDefined()
  })

  it('offers only the releases page when installing from here is blocked', async () => {
    const openExternal = vi.spyOn(api, 'openExternal').mockResolvedValue()
    await openWith({ status: 'available', release, installBlocker: 'Cascade is running from its disk image' })
    expect(dialogText()).toContain('running from its disk image')
    expect(buttonByText('Download and install')).toBeUndefined()
    buttonByText('Open releases page')!.click()
    expect(openExternal).toHaveBeenCalledWith(release.url)
  })

  it('skip remembers the version and closes', async () => {
    await openWith({ status: 'available', release, plan: { kind: 'bundle', relaunch: true } })
    buttonByText('Skip this version')!.click()
    flushSync()
    expect(settings.skippedUpdate).toBe('v9.0.0')
    expect(dialogs.update).toBe(false)
  })

  it('labels a Windows install as running the installer', async () => {
    vi.spyOn(api, 'downloadUpdate').mockResolvedValue()
    await openWith({ status: 'available', release, plan: { kind: 'installer', relaunch: false } })
    buttonByText('Download and install')!.click()
    await settle()
    expect(buttonByText('Run installer')).toBeDefined()
    expect(dialogText()).toContain('the installer will open')
  })

  it('shows a failed download with a way back', async () => {
    vi.spyOn(api, 'downloadUpdate').mockRejectedValue(new Error('the download does not match its published checksum'))
    await openWith({ status: 'available', release, plan: { kind: 'bundle', relaunch: true } })
    buttonByText('Download and install')!.click()
    await settle()
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('checksum')
    buttonByText('Try again')!.click()
    flushSync()
    expect(buttonByText('Download and install')).toBeDefined()
  })
})
