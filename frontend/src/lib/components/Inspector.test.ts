import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '../api'
import { NO_TARGET_MESSAGE, unknownEnvironmentMessage } from '../environments'
import type { AppNode, CredentialDef, EnvironmentDef } from '../model'
import { app } from '../state.svelte'
import Inspector from './Inspector.svelte'

const mkNode = (id: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    key: `key_${id.replace(/[^A-Za-z0-9]/g, '_')}`,
    method: 'GET',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status: 'idle',
    fields: [],
  },
})

let instance: ReturnType<typeof mount> | null = null

beforeEach(() => {
  document.body.innerHTML = ''
  app.nodes = [mkNode('n1')]
  app.edges = []
  app.selectedNodeId = 'n1'
  instance = mount(Inspector, { target: document.body })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
})

describe('Inspector credential picker', () => {
  const cred = (name: string, kind: CredentialDef['kind']): CredentialDef => ({
    name,
    kind,
    createdAt: '2026-01-01T00:00:00Z',
  })

  beforeEach(async () => {
    const [info] = await api.listProjects()
    app.project = {
      project: { id: info.id, name: info.name, defaults: {} },
      sources: [],
      environments: [],
      credentials: [cred('admin', 'bearer'), cred('internal', 'header')],
      boards: [],
      collections: [],
    }
    flushSync()
  })

  afterEach(() => {
    app.project = null
  })

  const credentialSelect = () =>
    document.querySelector('select[aria-label="Credential"]') as HTMLSelectElement

  it('offers None first, then credentials grouped by kind', () => {
    app.updateNodeData('n1', { credential: 'internal' })
    flushSync()
    const select = credentialSelect()
    expect(select.options[0].value).toBe('')
    expect(select.options[0].textContent).toBe('None')
    const groups = [...select.querySelectorAll('optgroup')]
    expect(groups.map((g) => g.label)).toEqual(['Bearer token', 'Custom header'])
    expect(select.value).toBe('internal')
    expect(document.body.textContent).not.toContain('no longer exists')
  })

  it('keeps a deleted credential visible as a disabled entry and warns, instead of silently showing None', () => {
    app.updateNodeData('n1', { credential: 'ghost' })
    flushSync()
    const select = credentialSelect()
    expect(select.value).toBe('ghost')
    const dangling = [...select.options].find((o) => o.value === 'ghost')
    expect(dangling?.disabled).toBe(true)
    expect(dangling?.textContent).toContain('(deleted)')
    expect(document.body.textContent).toContain('no longer exists')
  })
})

describe('Inspector close vs delete', () => {
  it('✕ closes the panel and keeps the node', () => {
    const close = document.querySelector('button[title="Close inspector"]') as HTMLButtonElement
    expect(close).not.toBeNull()
    close.click()
    flushSync()
    expect(app.selectedNodeId).toBeNull()
    expect(app.nodes).toHaveLength(1)
    expect(document.querySelector('aside')).toBeNull()
  })

  it('the footer delete button removes the node', () => {
    const del = document.querySelector('button[title="Delete node"]') as HTMLButtonElement
    expect(del).not.toBeNull()
    del.click()
    flushSync()
    expect(app.nodes).toHaveLength(0)
    expect(app.selectedNodeId).toBeNull()
    expect(document.querySelector('aside')).toBeNull()
  })
})

describe('Inspector environment picker', () => {
  const staging: EnvironmentDef = { name: 'staging', baseUrl: 'https://staging.example.com' }

  async function openProject(environments: EnvironmentDef[]) {
    const [info] = await api.listProjects()
    app.project = {
      project: { id: info.id, name: info.name, defaults: {} },
      sources: [],
      environments,
      credentials: [],
      boards: [],
      collections: [],
    }
    flushSync()
  }

  afterEach(() => {
    app.project = null
  })

  const environmentSelect = () =>
    document.querySelector('select[aria-label="Environment"]') as HTMLSelectElement

  it('offers None first, then the project environments', async () => {
    await openProject([staging, { name: 'local', baseUrl: 'http://localhost:8080' }])
    const select = environmentSelect()
    expect(select.options[0].value).toBe('')
    expect(select.options[0].textContent).toBe('None')
    expect([...select.options].map((o) => o.value)).toEqual(['', 'staging', 'local'])
    expect(select.value).toBe('staging')
    expect(document.body.textContent).not.toContain('pick an environment')
  })

  it('says the project has none instead of rendering an empty dropdown', async () => {
    await openProject([])
    app.updateNodeData('n1', { environment: '' })
    flushSync()
    // The dead end to avoid: nothing to pick, and no hint why.
    const hint = [...environmentSelect().options].find((o) => o.disabled)
    expect(hint?.textContent).toContain('No environments')
    expect(document.body.textContent).toContain(NO_TARGET_MESSAGE)
  })

  it('keeps a deleted environment visible as a disabled entry and warns', async () => {
    await openProject([])
    const select = environmentSelect()
    expect(select.value).toBe('staging')
    const dangling = [...select.options].find((o) => o.value === 'staging')
    expect(dangling?.disabled).toBe(true)
    expect(dangling?.textContent).toContain('(deleted)')
    expect(document.body.textContent).toContain(unknownEnvironmentMessage('staging'))
  })

  it('warns when an environment resolves to no base URL', async () => {
    await openProject([{ name: 'staging', baseUrl: '' }])
    expect(document.body.textContent).toContain(unknownEnvironmentMessage('staging'))
  })

  it('stays quiet for the two ways a node carries its own origin', async () => {
    await openProject([])
    // An origin override beats the environment (BuildRequest resolution order).
    app.updateNodeData('n1', { environment: '', origin: 'https://api.other.io' })
    flushSync()
    expect(document.body.textContent).not.toContain('pick an environment')

    // …and so does an absolute URL typed into the path.
    app.updateNodeData('n1', { origin: '', path: 'https://api.other.io/v1/x' })
    flushSync()
    expect(document.body.textContent).not.toContain('pick an environment')
  })
})
