import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { handleGlobalKeydown } from '../keyboard'
import { operations } from '../mock'
import { app } from '../state.svelte'
import Harness from './testing/ContextMenuHarness.svelte'

let instance: ReturnType<typeof mount> | null = null

const menuEl = () => document.querySelector('[data-testid="context-menu"]')
const itemLabels = () =>
  [...document.querySelectorAll('[data-testid="context-menu"] [role="menuitem"]')].map(
    (el) => el.textContent ?? '',
  )

beforeEach(() => {
  document.body.innerHTML = ''
  app.contextMenu = null
  app.isRunning = false
  app.canvasTool = 'select'
  // The add-node palette lists the open project's operations (plan 01).
  app.project = {
    project: { id: 'test-project', name: 'Test' },
    sources: [{ id: 'src-test', title: 'demo-api', operations }],
    environments: [],
    credentials: [],
    boards: [],
    collections: [],
  }
  window.addEventListener('keydown', handleGlobalKeydown)
  instance = mount(Harness, { target: document.body })
})

afterEach(() => {
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (instance) unmount(instance)
  instance = null
})

describe('ContextMenu component (plan 03 §2)', () => {
  it('is hidden until a menu is opened', () => {
    expect(menuEl()).toBeNull()
  })

  it('opens the pane menu with its entries at the cursor', () => {
    app.openContextMenu({ kind: 'pane', screen: { x: 40, y: 50 } })
    flushSync()
    expect(menuEl()).not.toBeNull()
    const labels = itemLabels()
    expect(labels.some((l) => l.includes('Add node…'))).toBe(true)
    expect(labels.some((l) => l.includes('Paste'))).toBe(true)
    expect(labels.some((l) => l.includes('Fit view'))).toBe(true)
    expect((menuEl() as HTMLElement).style.getPropertyValue('--cm-x')).toBe('40px')
  })

  it('opens the node menu with run/duplicate/rename/delete entries', () => {
    app.openContextMenu({ kind: 'node', id: 'n1', screen: { x: 10, y: 10 } })
    flushSync()
    const labels = itemLabels()
    for (const expected of ['Run this node', 'Run chain', 'Copy', 'Duplicate', 'Rename', 'Delete']) {
      expect(labels.some((l) => l.includes(expected))).toBe(true)
    }
  })

  it('opens the edge menu with the single cut entry', () => {
    app.openContextMenu({ kind: 'edge', id: 'e1', screen: { x: 10, y: 10 } })
    flushSync()
    const labels = itemLabels()
    expect(labels).toHaveLength(1)
    expect(labels[0]).toContain('Cut connection')
  })

  it('closes on Escape', () => {
    app.openContextMenu({ kind: 'pane', screen: { x: 10, y: 10 } })
    flushSync()
    expect(menuEl()).not.toBeNull()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    flushSync()
    expect(app.contextMenu).toBeNull()
    expect(menuEl()).toBeNull()
  })

  it('closes on click-away but not on clicks inside the menu', () => {
    app.openContextMenu({ kind: 'pane', screen: { x: 10, y: 10 } })
    flushSync()
    menuEl()!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    flushSync()
    expect(menuEl()).not.toBeNull()
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    flushSync()
    expect(menuEl()).toBeNull()
  })

  it('add-node palette places the picked operation at the remembered flow position', () => {
    const before = app.nodes.length
    app.openContextMenu({ kind: 'pane', screen: { x: 222, y: 333 } })
    flushSync()
    const addBtn = [...document.querySelectorAll('[role="menuitem"]')].find((el) =>
      el.textContent?.includes('Add node…'),
    ) as HTMLButtonElement
    addBtn.click()
    flushSync()
    const search = document.querySelector('[data-testid="context-menu"] input') as HTMLInputElement
    expect(search).not.toBeNull()
    search.value = 'orgs'
    search.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    const option = document.querySelector(
      '[data-testid="context-menu"] [role="menuitem"]',
    ) as HTMLButtonElement
    expect(option.textContent).toContain('/v1/orgs')
    option.click()
    flushSync()
    expect(app.nodes.length).toBe(before + 1)
    // No mounted flow in jsdom, so screenToFlowPosition falls back to the screen point.
    expect(app.nodes.at(-1)!.position).toEqual({ x: 222, y: 333 })
    expect(app.contextMenu).toBeNull()
  })

  it('delete entry removes the node and closes the menu', () => {
    app.nodes = [
      {
        id: 'victim',
        type: 'http',
        position: { x: 0, y: 0 },
        data: {
          name: 'victim',
          key: 'victim',
          method: 'GET',
          path: '/v1/victim',
          environment: 'staging',
          credential: 'staging-admin',
          status: 'idle',
          fields: [],
        },
      },
    ]
    app.openContextMenu({ kind: 'node', id: 'victim', screen: { x: 10, y: 10 } })
    flushSync()
    const del = [...document.querySelectorAll('[role="menuitem"]')].find(
      (el) => el.textContent?.includes('Delete'),
    ) as HTMLButtonElement
    del.click()
    flushSync()
    expect(app.nodes).toHaveLength(0)
    expect(app.contextMenu).toBeNull()
  })
})
