// Plan 01 P3/P5: project switching swaps the whole working set, and board
// edits round-trip through the (in-memory) store. Without a Wails runtime,
// `api` resolves to the in-memory implementation seeded from mock.ts — the
// same shape the Go store serves.
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import Sidebar from './components/Sidebar.svelte'
import { dialogs } from './dialogs.svelte'
import type { HttpNode } from './model'
import { app } from './state.svelte'

let instance: ReturnType<typeof mount> | null = null

const mountSidebar = () => {
  document.body.innerHTML = ''
  instance = mount(Sidebar, { target: document.body })
  flushSync()
}

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  vi.restoreAllMocks()
})

/** Open a project by name via the switcher's data source. */
async function openByName(name: string) {
  const info = app.projects.find((p) => p.name === name)
  if (!info) throw new Error(`no project named ${name}`)
  await app.openProject(info.id)
}

describe('project state (plan 01)', () => {
  it('init opens the last-opened project with the seeded working set', async () => {
    await app.init()
    await openByName('Default')
    expect(app.projectName).toBe('Default')
    expect(app.operations).toHaveLength(8)
    expect(app.environments.map((e) => e.name)).toContain('staging')
    expect(app.credentials.map((c) => c.kind)).toContain('bearer')
    expect(app.nodes).toHaveLength(5)
    expect(app.edges).toHaveLength(4)
    // Persisted boards carry no run state.
    expect(app.nodes.every((n) => !('status' in n.data) || n.data.status === 'idle')).toBe(true)
  })

  it('switching projects swaps the sidebar palette and the canvas', async () => {
    await app.init()
    await openByName('Default')
    mountSidebar()
    expect(document.body.textContent).toContain('/v1/users')

    await app.createProject('Payments')
    flushSync()
    expect(app.projectName).toBe('Payments')
    expect(app.nodes).toHaveLength(0)
    expect(app.edges).toHaveLength(0)
    expect(document.body.textContent).not.toContain('/v1/users')
    expect(document.body.textContent).toContain('No schemas imported into')
    expect(document.body.textContent).toContain('Payments')

    await openByName('Default')
    flushSync()
    expect(document.body.textContent).toContain('/v1/users')
    expect(app.nodes).toHaveLength(5)
  })

  it('board edits survive switching away and back (save/load round trip)', async () => {
    await app.init()
    await openByName('Default')
    const before = app.nodes.length
    app.addNode(app.operations[0], { x: 42, y: 43 })
    const added = app.nodes.at(-1) as HttpNode
    // New nodes pick up the project defaults instead of hardcoded targets.
    expect(added.data.environment).toBe('staging')
    expect(added.data.credential).toBe('staging-admin')

    // Switching flushes the pending debounced save before swapping boards.
    await app.createProject('Scratch')
    expect(app.nodes).toHaveLength(0)
    await openByName('Default')
    expect(app.nodes).toHaveLength(before + 1)
    const reloaded = app.nodes.find((n) => n.id === added.id) as HttpNode
    expect(reloaded.position).toEqual({ x: 42, y: 43 })
    expect(reloaded.data.name).toBe(added.data.name)
  })

  it('a failed save is toasted, and leaves the canvas alone', async () => {
    await app.init()
    await openByName('Default')
    dialogs.toast = null
    vi.spyOn(api, 'saveBoard').mockRejectedValue(new Error('permission denied'))

    app.addNode(app.operations[0], { x: 7, y: 8 })
    const added = app.nodes.at(-1)!
    await app.flushBoardSave()

    expect(dialogs.toast).toContain('Board save failed')
    expect(dialogs.toast).toContain('permission denied')
    expect(app.nodes.at(-1)).toBe(added)
  })

  it('renaming updates the chip data and index', async () => {
    await app.init()
    await app.createProject('Old Name')
    await app.renameCurrentProject('New Name')
    expect(app.projectName).toBe('New Name')
    expect(app.projects.some((p) => p.name === 'New Name')).toBe(true)
    expect(app.projects.some((p) => p.name === 'Old Name')).toBe(false)
  })

  it('deleting the current project falls back to the most recently opened one', async () => {
    await app.init()
    await openByName('Default')
    await app.createProject('Doomed')
    expect(app.projectName).toBe('Doomed')

    await app.deleteCurrentProject()
    expect(app.projects.some((p) => p.name === 'Doomed')).toBe(false)
    expect(app.projectName).toBe('Default')
    expect(app.project).not.toBeNull()
  })
})
