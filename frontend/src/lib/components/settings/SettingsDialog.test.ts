import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { dialogs } from '../../dialogs.svelte'
import { readJSON } from '../../prefsStorage'
import { SETTINGS_STORAGE_KEY, settings } from '../../settings.svelte'
import { SETTINGS_SECTIONS, type SettingsSection } from '../../settingsSections'
import { updates } from '../../updates.svelte'
import { app } from '../../state.svelte'
import SettingsDialog from './SettingsDialog.svelte'

const CAPTURE_LABEL = 'Save response bodies in board files'

let instance: ReturnType<typeof mount> | null = null

// Icon ligature names render as text too, so labels are matched by substring.
const navButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[aria-label="Settings sections"] button')].find((b) =>
    b.textContent?.includes(label),
  )!
const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes(text))!
const toggle = (label: string) => document.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`)!
const select = (label: string) => document.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!

function open(section: SettingsSection = 'general') {
  instance = mount(SettingsDialog, { target: document.body, props: { section } })
  flushSync()
}

function choose(label: string, value: string) {
  const el = select(label)
  el.value = value
  el.dispatchEvent(new Event('change', { bubbles: true })) // Svelte delegates change from the root
  flushSync()
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}

beforeEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  settings.reset()
  app.project = {
    project: { id: 'p1', name: 'Proj', defaults: {} },
    sources: [],
    environments: [],
    credentials: [],
    boards: [],
    collections: [],
  }
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.settings = null
  dialogs.toast = null
  vi.restoreAllMocks()
})

describe('SettingsDialog', () => {
  it('lists every section and opens on the requested one', () => {
    open('appearance')
    expect(document.querySelectorAll('[aria-label="Settings sections"] button')).toHaveLength(SETTINGS_SECTIONS.length)
    expect(navButton('Appearance').getAttribute('aria-current')).toBe('true')
    expect(select('Theme')).not.toBeNull()
  })

  it('switches sections from the nav', () => {
    open()
    navButton('Shortcuts').click()
    flushSync()
    expect(document.body.textContent).toContain('Open settings')
  })

  it('appearance changes go through the settings store and persist', () => {
    open('appearance')
    choose('Theme', 'light')
    choose('Interface scale', '1.25')
    choose('Canvas grid', 'none')
    toggle('Show the minimap').click()
    flushSync()
    expect(settings.snapshot()).toMatchObject({ theme: 'light', uiScale: 1.25, canvasGrid: 'none', showMinimap: false })
    expect(JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toMatchObject({ theme: 'light', showMinimap: false })
  })

  it('general toggles the delete confirmation and can restore the defaults', () => {
    open()
    toggle('Ask before deleting a loop with nodes inside').click()
    flushSync()
    expect(settings.confirmDeleteWithChildren).toBe(false)
    buttonByText('Restore').click()
    flushSync()
    expect(settings.confirmDeleteWithChildren).toBe(true)
  })
})

describe('SettingsDialog keyboard', () => {
  it('takes focus on open so Escape closes it even when opened from a button', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    dialogs.settings = { section: 'general' }
    open()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    expect(dialog.contains(document.activeElement)).toBe(true)
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    flushSync()
    expect(dialogs.settings).toBeNull()
    unmount(instance!)
    instance = null
    expect(document.activeElement).toBe(opener)
  })

  it('keeps global shortcuts from firing while it is open', () => {
    const windowSpy = vi.fn()
    window.addEventListener('keydown', windowSpy)
    open()
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }))
    window.removeEventListener('keydown', windowSpy)
    expect(windowSpy).not.toHaveBeenCalled()
  })
})

describe('SettingsDialog project section', () => {
  it('says what response capture costs, rather than being a bare label', () => {
    open('project')
    const text = document.body.textContent ?? ''
    expect(text).toContain(CAPTURE_LABEL)
    expect(text).toContain('access tokens')
    expect(text).toContain('git')
    // Default on, so an unread toggle leaves capture where it was.
    expect(toggle(CAPTURE_LABEL).getAttribute('aria-checked')).toBe('true')
  })

  it('turns capture off and persists it', async () => {
    const spy = vi.spyOn(api, 'setCaptureResponses').mockResolvedValue()
    open('project')
    toggle(CAPTURE_LABEL).click()
    await settle()
    expect(spy).toHaveBeenCalledWith('p1', false)
    expect(app.project?.project.captureResponses).toBe(false)
    expect(toggle(CAPTURE_LABEL).getAttribute('aria-checked')).toBe('false')
  })

  it('rolls back and toasts when the write fails', async () => {
    vi.spyOn(api, 'setCaptureResponses').mockRejectedValue(new Error('disk full'))
    open('project')
    toggle(CAPTURE_LABEL).click()
    await settle()
    expect(app.project?.project.captureResponses).toBeUndefined()
    expect(toggle(CAPTURE_LABEL).getAttribute('aria-checked')).toBe('true')
    expect(dialogs.toast).toContain('disk full')
  })

  it('disables the toggle with no project open', () => {
    app.project = null
    open('project')
    expect(toggle(CAPTURE_LABEL).disabled).toBe(true)
  })
})

describe('SettingsDialog about section', () => {
  it('shows the build, checks on demand and remembers the launch-check switch', async () => {
    vi.spyOn(api, 'checkForUpdate').mockResolvedValue({ status: 'upToDate' })
    open('about')
    expect(document.querySelector('[aria-label="About Cascade"]')?.textContent).toContain('Cascade dev')

    buttonByText('Check for updates').click()
    await settle()
    expect(api.checkForUpdate).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="status"]')?.textContent).toContain("You're on the latest version")

    toggle('Check for updates at launch').click()
    flushSync()
    expect(settings.checkForUpdates).toBe(false)
    expect(readJSON(SETTINGS_STORAGE_KEY)).toMatchObject({ checkForUpdates: false })
  })

  it('hands an available update over to the update dialog', async () => {
    vi.spyOn(api, 'checkForUpdate').mockResolvedValue({
      status: 'available',
      release: { version: '9.0.0', tag: 'v9.0.0', notes: '', url: '', publishedAt: '2026-10-10T00:00:00Z' },
      plan: { kind: 'bundle', relaunch: true },
    })
    open('about')
    buttonByText('Check for updates').click()
    await settle()
    expect(document.querySelector('[role="status"]')?.textContent).toContain('Version 9.0.0 is available')

    buttonByText('View').click()
    flushSync()
    expect(dialogs.settings).toBeNull()
    expect(dialogs.update).toBe(true)
    updates.later()
  })
})
