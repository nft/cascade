import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { dialogs } from '../../dialogs.svelte'
import { SETTINGS_STORAGE_KEY, settings } from '../../settings.svelte'
import type { SettingsSection } from '../../settingsSections'
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
    expect(document.querySelectorAll('[aria-label="Settings sections"] button')).toHaveLength(4)
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
