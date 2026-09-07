import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../../api'
import { dialogs } from '../../dialogs.svelte'
import type { EnvironmentDef, HttpNode } from '../../model'
import { app } from '../../state.svelte'
import Sidebar from '../Sidebar.svelte'
import EnvironmentsPanel from './EnvironmentsPanel.svelte'

const local: EnvironmentDef = { name: 'local', baseUrl: 'http://localhost:8080' }
const staging: EnvironmentDef = { name: 'staging', baseUrl: 'https://staging.example.com' }

let instance: ReturnType<typeof mount> | null = null

function mountComponent(component: typeof EnvironmentsPanel | typeof Sidebar) {
  document.body.innerHTML = ''
  instance = mount(component, { target: document.body })
  flushSync()
}

// Icon ligature names prefix textContent (e.g. "editEdit"), so match by includes.
const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )

const httpNode = (id: string, environment: string) =>
  ({
    id,
    type: 'http',
    position: { x: 0, y: 0 },
    data: { environment },
  }) as unknown as HttpNode

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  flushSync()
}

beforeEach(async () => {
  const [info] = await api.listProjects()
  app.nodes = []
  app.edges = []
  app.sidebarTab = 'environments'
  app.project = {
    project: { id: info.id, name: info.name, defaults: { environment: 'local' } },
    sources: [],
    environments: [structuredClone(local), structuredClone(staging)],
    credentials: [],
    boards: [],
    collections: [],
  }
  await api.saveEnvironments(info.id, [local, staging])
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.environment = null
  dialogs.toast = null
  app.sidebarTab = 'operations'
  vi.restoreAllMocks()
})

describe('Sidebar environments tab', () => {
  it('renders the panel, not the old read-only list', () => {
    mountComponent(Sidebar)
    expect(buttonByText('Add environment')).toBeDefined()
    expect(buttonByText('Edit')).toBeDefined()
  })
})

describe('EnvironmentsPanel', () => {
  it('marks the project default and offers to move it to the others', async () => {
    mountComponent(EnvironmentsPanel)
    expect(document.body.textContent).toContain('default')

    // Only the non-default rows carry the action, so one button exists.
    const setDefault = [...document.querySelectorAll<HTMLButtonElement>('button')].filter((b) =>
      b.textContent?.includes('Set default'),
    )
    expect(setDefault).toHaveLength(1)
    setDefault[0].click()
    await settle()
    expect(app.project?.project.defaults).toEqual({ environment: 'staging' })
  })

  it('flags an environment with no base URL — nodes targeting it cannot run', () => {
    app.project!.environments = [{ name: 'imported', baseUrl: '' }]
    mountComponent(EnvironmentsPanel)
    expect(document.body.textContent).toContain('No base URL')
  })

  it('opens the dialog in the right mode from each action', () => {
    mountComponent(EnvironmentsPanel)
    buttonByText('Edit')!.click()
    expect(dialogs.environment).toEqual({ mode: 'edit', name: 'local' })
    buttonByText('Add environment')!.click()
    expect(dialogs.environment).toEqual({ mode: 'create' })
  })

  it('deletes via two-step confirm, warning about referencing nodes', async () => {
    app.nodes = [httpNode('n1', 'local'), httpNode('n2', 'local')]
    mountComponent(EnvironmentsPanel)

    const del = buttonByText('Delete')!
    del.click()
    flushSync()
    expect(del.textContent).toContain('2 nodes use it')
    expect(app.environments).toHaveLength(2) // first click only arms

    del.click()
    await settle()
    expect(app.environments).toEqual([staging])
    // Deleting the default hands it on rather than leaving new nodes targetless.
    expect(app.project?.project.defaults).toEqual({ environment: 'staging' })
  })

  it('says the project has nowhere to send requests when empty', () => {
    app.project!.environments = []
    mountComponent(EnvironmentsPanel)
    expect(document.body.textContent).toContain('No environments in')
  })

  it('toasts a failed write instead of just putting the row back', async () => {
    vi.spyOn(api, 'setProjectDefaults').mockRejectedValue(new Error('disk full'))
    mountComponent(EnvironmentsPanel)

    buttonByText('Set default')!.click()
    await settle()
    expect(dialogs.toast).toContain('disk full')
    // Rolled back, which on its own is indistinguishable from a dead click.
    expect(app.project?.project.defaults).toEqual({ environment: 'local' })
  })
})
