import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { dialogs } from './dialogs.svelte'
import { applyImportMappings, finishEnvelopeImport } from './importActions.svelte'
import type { RequirementRow } from './importMapping'
import type { AppNode, CollectionDef, RequestDef } from './model'
import { app } from './state.svelte'

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
    fields: [],
  },
})

const request = (id: string): RequestDef => ({ id, name: id, protocol: 'http', method: 'GET', url: `/v1/${id}` })

beforeEach(() => {
  app.project = {
    project: { id: 'p1', name: 'Proj', defaults: {} },
    sources: [],
    environments: [{ name: 'staging', baseUrl: 'https://staging.x' }],
    credentials: [{ name: 'staging-admin', kind: 'bearer', createdAt: 't' }],
    boards: [],
    collections: [],
  }
  app.boardId = 'b1'
  app.boardName = 'Main'
  app.nodes = [httpNode('n1', 'prod', 'prod-admin')]
  app.edges = []
})

afterEach(() => {
  dialogs.importMapping = null
  vi.restoreAllMocks()
})

describe('finishEnvelopeImport (plan 07 E4/E5)', () => {
  it('is zero-dialog when every requirement matches by name', async () => {
    await finishEnvelopeImport(
      app,
      { environments: ['staging'], credentials: [{ name: 'staging-admin', kind: 'bearer' }], sources: [] },
      undefined,
      ['n1'],
    )
    expect(dialogs.importMapping).toBeNull()
  })

  it('opens the wizard over the imported nodes when something did not match', async () => {
    await finishEnvelopeImport(
      app,
      { environments: ['prod'], credentials: [{ name: 'prod-admin', kind: 'basic' }], sources: [] },
      undefined,
      ['n1'],
    )
    expect(dialogs.importMapping).toEqual({
      rows: [
        { type: 'environment', name: 'prod' },
        { type: 'credential', name: 'prod-admin', kind: 'basic' },
      ],
      nodeIds: ['n1'],
    })
  })

  it('merges embedded collections into the library', async () => {
    const spy = vi.spyOn(api, 'saveCollection').mockResolvedValue()
    const embedded: CollectionDef[] = [
      { id: 'col1', name: 'Users API', root: { id: 'root', name: '', requests: [request('r1')] } },
    ]
    await finishEnvelopeImport(app, undefined, embedded, ['n1'])
    expect(spy).toHaveBeenCalledWith('p1', embedded[0])
    expect(app.project?.collections.map((c) => c.id)).toEqual(['col1'])
  })

  it('skips saving when the embedded requests are already present', async () => {
    app.project!.collections = [
      { id: 'col1', name: 'Users API', root: { id: 'root', name: '', requests: [request('r1')] } },
    ]
    const spy = vi.spyOn(api, 'saveCollection').mockResolvedValue()
    await finishEnvelopeImport(app, undefined, app.project!.collections, ['n1'])
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('applyImportMappings (plan 07 E4)', () => {
  const rows: RequirementRow[] = [
    { type: 'environment', name: 'prod' },
    { type: 'credential', name: 'prod-admin', kind: 'basic' },
  ]

  it('creates placeholders carrying the required names', async () => {
    const envSpy = vi.spyOn(api, 'saveEnvironments').mockResolvedValue()
    const credSpy = vi.spyOn(api, 'saveCredentials').mockResolvedValue()
    const error = await applyImportMappings(app, rows, [{ action: 'create' }, { action: 'create' }], ['n1'])
    expect(error).toBeNull()
    expect(envSpy).toHaveBeenCalledWith('p1', [
      { name: 'staging', baseUrl: 'https://staging.x' },
      { name: 'prod', baseUrl: '' },
    ])
    expect(credSpy).toHaveBeenCalledTimes(1)
    expect(app.credentials.map((c) => [c.name, c.kind])).toEqual([
      ['staging-admin', 'bearer'],
      ['prod-admin', 'basic'],
    ])
    // Placeholders keep the node references intact — no rewrite needed.
    expect(app.nodes[0].data).toMatchObject({ environment: 'prod', credential: 'prod-admin' })
  })

  it('rewrites the imported nodes when mapping to existing entries', async () => {
    const error = await applyImportMappings(
      app,
      rows,
      [
        { action: 'existing', target: 'staging' },
        { action: 'existing', target: 'staging-admin' },
      ],
      ['n1'],
    )
    expect(error).toBeNull()
    expect(app.nodes[0].data).toMatchObject({ environment: 'staging', credential: 'staging-admin' })
  })

  it('leaves skipped rows unmapped', async () => {
    const envSpy = vi.spyOn(api, 'saveEnvironments').mockResolvedValue()
    const error = await applyImportMappings(app, rows, [{ action: 'skip' }, { action: 'skip' }], ['n1'])
    expect(error).toBeNull()
    expect(envSpy).not.toHaveBeenCalled()
    expect(app.nodes[0].data).toMatchObject({ environment: 'prod', credential: 'prod-admin' })
  })

  it('rolls back optimistic placeholder state when the save fails', async () => {
    vi.spyOn(api, 'saveEnvironments').mockRejectedValue(new Error('disk full'))
    const error = await applyImportMappings(app, rows, [{ action: 'create' }, { action: 'create' }], ['n1'])
    expect(error).toContain('disk full')
    expect(app.environments.map((e) => e.name)).toEqual(['staging'])
    expect(app.credentials.map((c) => c.name)).toEqual(['staging-admin'])
  })
})
