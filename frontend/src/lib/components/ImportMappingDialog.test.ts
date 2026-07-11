import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { dialogs } from '../dialogs.svelte'
import type { AppNode } from '../model'
import { app } from '../state.svelte'
import ImportMappingDialog from './ImportMappingDialog.svelte'

const httpNode = (id: string, environment: string, credential: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    key: id,
    method: 'GET',
    path: '/v1/x',
    environment,
    credential,
    status: 'idle',
    repeat: 1,
    fields: [],
  },
})

let instance: ReturnType<typeof mount> | null = null

const selects = () => [...document.querySelectorAll<HTMLSelectElement>('select')]
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === label)!

beforeEach(() => {
  document.body.innerHTML = ''
  app.project = {
    project: { id: 'p1', name: 'Proj', defaults: {} },
    sources: [],
    environments: [{ name: 'staging', baseUrl: 'https://staging.x' }],
    credentials: [{ name: 'staging-admin', kind: 'bearer', createdAt: 't' }],
    boards: [],
    collections: [],
  }
  app.boardId = 'b1'
  app.nodes = [httpNode('n1', 'prod', 'prod-admin')]
  dialogs.importMapping = {
    rows: [
      { type: 'environment', name: 'prod' },
      { type: 'credential', name: 'prod-admin', kind: 'basic' },
    ],
    nodeIds: ['n1'],
  }
  instance = mount(ImportMappingDialog, {
    target: document.body,
    props: { context: dialogs.importMapping },
  })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  dialogs.importMapping = null
  vi.restoreAllMocks()
})

describe('ImportMappingDialog (plan 07 E4)', () => {
  it('renders one row per unmatched requirement, defaulting to placeholder creation', () => {
    expect(selects()).toHaveLength(2)
    expect(selects().every((s) => s.value === 'create')).toBe(true)
    expect(document.body.textContent).toContain('Environment “prod”')
    expect(document.body.textContent).toContain('Credential “prod-admin” (basic)')
  })

  it('offers the project\'s existing entries per row', () => {
    const [env, cred] = selects()
    expect([...env.options].map((o) => o.value)).toEqual(['create', 'existing:staging', 'skip'])
    expect([...cred.options].map((o) => o.value)).toEqual(['create', 'existing:staging-admin', 'skip'])
  })

  it('applies the chosen resolutions and closes', async () => {
    vi.spyOn(api, 'saveEnvironments').mockResolvedValue()
    const [env, cred] = selects()
    // Environment: create the placeholder; credential: map to the existing one.
    cred.value = 'existing:staging-admin'
    cred.dispatchEvent(new Event('change'))
    flushSync()
    button('Apply').click()
    await vi.waitFor(() => expect(dialogs.importMapping).toBeNull())
    expect(env.value).toBe('create')
    expect(app.environments.map((e) => e.name)).toEqual(['staging', 'prod'])
    expect(app.nodes[0].data).toMatchObject({ environment: 'prod', credential: 'staging-admin' })
  })

  it('closes without touching anything on Skip all', () => {
    button('Skip all').click()
    flushSync()
    expect(dialogs.importMapping).toBeNull()
    expect(app.environments).toHaveLength(1)
    expect(app.nodes[0].data).toMatchObject({ environment: 'prod', credential: 'prod-admin' })
  })
})
