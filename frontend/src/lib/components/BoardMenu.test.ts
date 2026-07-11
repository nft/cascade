import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
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

describe('BoardMenu (plan 07 E2)', () => {
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
