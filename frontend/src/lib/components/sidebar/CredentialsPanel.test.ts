import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '../../api'
import { dialogs } from '../../dialogs.svelte'
import type { CredentialDef, HttpNode } from '../../model'
import { app } from '../../state.svelte'
import Sidebar from '../Sidebar.svelte'
import CredentialsPanel from './CredentialsPanel.svelte'

const credential: CredentialDef = {
  name: 'internal',
  kind: 'header',
  header: 'X-Internal-Token',
  template: 'Token {secret}',
  createdAt: '2026-01-01T00:00:00Z',
}

let instance: ReturnType<typeof mount> | null = null

function mountComponent(component: typeof CredentialsPanel | typeof Sidebar) {
  document.body.innerHTML = ''
  instance = mount(component, { target: document.body })
  flushSync()
}

// Icon ligature names prefix textContent (e.g. "editEdit"), so match by includes.
const buttonByText = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(text),
  )

beforeEach(async () => {
  const [info] = await api.listProjects()
  app.nodes = []
  app.edges = []
  app.sidebarTab = 'credentials'
  app.project = {
    project: { id: info.id, name: info.name, defaults: {} },
    sources: [],
    environments: [],
    credentials: [structuredClone(credential)],
    boards: [],
    collections: [],
  }
  await api.saveCredentials(info.id, [credential])
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.credential = null
  app.sidebarTab = 'operations'
})

describe('Sidebar credentials tab', () => {
  it('renders a tab labeled Credentials (never "API keys") showing the panel', () => {
    mountComponent(Sidebar)
    expect(buttonByText('Credentials')).toBeDefined()
    expect(document.body.textContent).not.toMatch(/api key/i)
    expect(buttonByText('Add credential')).toBeDefined()
  })
})

describe('CredentialsPanel', () => {
  it('shows metadata and a mask — never anything value-like', () => {
    mountComponent(CredentialsPanel)
    const text = document.body.textContent ?? ''
    expect(text).toContain('internal')
    expect(text).toContain('X-Internal-Token: Token ••••••')
    expect(text).toContain('••••••')
  })

  it('opens the dialog in the right mode from each action', () => {
    mountComponent(CredentialsPanel)
    buttonByText('Rotate')!.click()
    expect(dialogs.credential).toEqual({ mode: 'rotate', name: 'internal' })
    buttonByText('Edit')!.click()
    expect(dialogs.credential).toEqual({ mode: 'edit', name: 'internal' })
    buttonByText('Add credential')!.click()
    expect(dialogs.credential).toEqual({ mode: 'create' })
  })

  it('deletes via two-step confirm, warning about referencing nodes', async () => {
    const node = {
      id: 'n1',
      type: 'http',
      position: { x: 0, y: 0 },
      data: { credential: 'internal' },
    } as unknown as HttpNode
    app.nodes = [node]
    mountComponent(CredentialsPanel)

    const del = buttonByText('Delete')!
    del.click()
    flushSync()
    expect(del.textContent).toContain('1 node uses it')
    expect(app.credentials).toHaveLength(1) // first click only arms

    del.click()
    flushSync()
    await Promise.resolve()
    expect(app.credentials).toHaveLength(0)
  })
})
