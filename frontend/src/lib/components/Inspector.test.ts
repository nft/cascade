import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { api } from '../api'
import type { AppNode, CredentialDef } from '../model'
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
    repeat: 1,
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

describe('Inspector credential picker (plan 04 K5)', () => {
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

describe('Inspector close vs delete (plan 03 §1)', () => {
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
