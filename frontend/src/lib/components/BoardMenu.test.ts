import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { dialogs } from '../dialogs.svelte'
import { app } from '../state.svelte'
import BoardMenu from './BoardMenu.svelte'

let instance: ReturnType<typeof mount> | null = null

const menuButton = () => document.querySelector<HTMLButtonElement>('[aria-label="Board menu"]')!
// Icon ligature names render as text too, so labels are matched by substring.
const menuRow = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find((b) =>
    b.textContent?.includes(label),
  )

beforeEach(() => {
  document.body.innerHTML = ''
  app.project = {
    project: { id: 'p1', name: 'Proj', defaults: {} },
    sources: [],
    environments: [],
    credentials: [],
    boards: [],
    collections: [],
  }
  app.boardId = 'b1'
  app.boardName = 'Main'
  instance = mount(BoardMenu, { target: document.body })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  vi.restoreAllMocks()
})

describe('BoardMenu', () => {
  it('opens with the export, import and copy entries', () => {
    menuButton().click()
    flushSync()
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(3)
    expect(menuRow('Export board…')).toBeDefined()
    expect(menuRow('Import board…')).toBeDefined()
    expect(menuRow('Copy board as JSON')).toBeDefined()
  })

  it('is disabled without an open board', () => {
    app.boardId = null
    flushSync()
    expect(menuButton().disabled).toBe(true)
  })

  it('copy flips the row to "Copied" on success', async () => {
    vi.spyOn(api, 'copyBoardJSON').mockResolvedValue()
    menuButton().click()
    flushSync()
    menuRow('Copy board as JSON')!.click()
    await vi.waitFor(() => {
      flushSync()
      expect(menuRow('Copied')).toBeDefined()
    })
  })

  it('export goes through the save-dialog binding and closes the menu', async () => {
    const spy = vi.spyOn(api, 'exportBoardToFile').mockResolvedValue('/tmp/proj-main.cascade.json')
    menuButton().click()
    flushSync()
    menuRow('Export board…')!.click()
    flushSync()
    expect(document.querySelector('[role="menuitem"]')).toBeNull()
    await vi.waitFor(() => expect(spy).toHaveBeenCalledWith('p1', 'b1'))
  })
})

describe('BoardMenu response-capture toggle', () => {
  const toggle = () =>
    document.querySelector<HTMLButtonElement>('[role="menuitemcheckbox"]')!

  async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync()
  }

  it('says what turning it on costs, rather than being a bare label', () => {
    menuButton().click()
    flushSync()
    const text = toggle().textContent ?? ''
    expect(text).toContain('Save response bodies in board files')
    expect(text).toContain('access tokens')
    expect(text).toContain('git')
    // Default on, so an unread toggle leaves capture where it was.
    expect(toggle().getAttribute('aria-checked')).toBe('true')
  })

  it('turns capture off and persists it', async () => {
    const spy = vi.spyOn(api, 'setCaptureResponses').mockResolvedValue()
    menuButton().click()
    flushSync()

    toggle().click()
    await settle()
    expect(spy).toHaveBeenCalledWith('p1', false)
    expect(app.project?.project.captureResponses).toBe(false)
    expect(toggle().getAttribute('aria-checked')).toBe('false')
    // The menu stays open — the click's whole feedback is the box flipping.
    expect(document.querySelector('[role="menuitemcheckbox"]')).not.toBeNull()
  })

  it('rolls back and toasts when the write fails', async () => {
    vi.spyOn(api, 'setCaptureResponses').mockRejectedValue(new Error('disk full'))
    menuButton().click()
    flushSync()

    toggle().click()
    await settle()
    expect(app.project?.project.captureResponses).toBeUndefined()
    expect(dialogs.toast).toContain('disk full')
    dialogs.toast = null
  })
})
