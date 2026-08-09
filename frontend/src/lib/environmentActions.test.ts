import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import {
  deleteEnvironment,
  environmentNodeRefCount,
  saveEnvironment,
  setDefaultEnvironment,
} from './environmentActions.svelte'
import type { AppNode, EnvironmentDef } from './model'
import { app } from './state.svelte'

const local: EnvironmentDef = { name: 'local', baseUrl: 'http://localhost:8080' }
const staging: EnvironmentDef = { name: 'staging', baseUrl: 'https://staging.example.com' }

const httpNode = (id: string, environment: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    key: id,
    method: 'GET',
    path: '/v1/x',
    environment,
    credential: '',
    status: 'idle',
    fields: [],
  },
})

function project(environments: EnvironmentDef[], environment?: string) {
  app.project = {
    project: { id: 'p1', name: 'Proj', defaults: environment ? { environment } : {} },
    sources: [],
    environments,
    credentials: [],
    boards: [],
    collections: [],
  }
  app.boardId = 'b1'
  app.nodes = []
  app.edges = []
}

let saved: ReturnType<typeof vi.spyOn>
let defaulted: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  project([])
  saved = vi.spyOn(api, 'saveEnvironments').mockResolvedValue()
  defaulted = vi.spyOn(api, 'setProjectDefaults').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('environment flows (plan 11 W7)', () => {
  it('adds the first environment and claims the project default', async () => {
    expect(await saveEnvironment(app, local)).toBeNull()
    expect(app.environments).toEqual([local])
    expect(saved).toHaveBeenCalledWith('p1', [local])
    // The point of writing defaults here: the next node added is born with a
    // target instead of environment: ''.
    expect(defaulted).toHaveBeenCalledWith('p1', { environment: 'local' })
    expect(app.project?.project.defaults).toEqual({ environment: 'local' })
  })

  it('adds a second environment without moving the default', async () => {
    project([local], 'local')
    expect(await saveEnvironment(app, staging)).toBeNull()
    expect(app.environments).toEqual([local, staging])
    expect(defaulted).toHaveBeenCalledWith('p1', { environment: 'local' })
  })

  it('edits in place rather than appending — names are the identity', async () => {
    project([local, staging], 'local')
    const moved = { name: 'local', baseUrl: 'http://127.0.0.1:9000' }
    expect(await saveEnvironment(app, moved)).toBeNull()
    expect(app.environments).toEqual([moved, staging])
  })

  it('deletes an environment and hands the default to what remains', async () => {
    project([local, staging], 'local')
    expect(await deleteEnvironment(app, 'local')).toBeNull()
    expect(app.environments).toEqual([staging])
    expect(defaulted).toHaveBeenCalledWith('p1', { environment: 'staging' })
  })

  it('clears the default when the last environment is deleted', async () => {
    project([local], 'local')
    expect(await deleteEnvironment(app, 'local')).toBeNull()
    expect(app.environments).toEqual([])
    expect(app.project?.project.defaults).toEqual({ environment: '' })
  })

  it('moves the default on an explicit pick, leaving the list alone', async () => {
    project([local, staging], 'local')
    expect(await setDefaultEnvironment(app, 'staging')).toBeNull()
    expect(app.environments).toEqual([local, staging])
    expect(app.project?.project.defaults).toEqual({ environment: 'staging' })
  })

  it('rolls the list and the default back together when a write fails', async () => {
    project([local], 'local')
    defaulted.mockRejectedValue(new Error('disk full'))
    const error = await saveEnvironment(app, staging)
    expect(error).toContain('disk full')
    expect(app.environments).toEqual([local])
    expect(app.project?.project.defaults).toEqual({ environment: 'local' })
  })

  it('refuses to write with no project open', async () => {
    app.project = null
    expect(await saveEnvironment(app, local)).toBe('no project open')
    expect(saved).not.toHaveBeenCalled()
    expect(defaulted).not.toHaveBeenCalled()
  })

  it('counts referencing nodes across the open board and the saved ones', () => {
    project([local, staging], 'local')
    app.nodes = [httpNode('n1', 'local'), httpNode('n2', 'staging')]
    app.project!.boards = [
      {
        formatVersion: 1,
        id: 'b2',
        name: 'Other',
        nodes: [{ id: 'n3', type: 'http', data: { environment: 'local' } }],
        edges: [],
        layout: { positions: {} },
      },
    ]
    expect(environmentNodeRefCount(app, 'local')).toBe(2)
    expect(environmentNodeRefCount(app, 'staging')).toBe(1)
  })
})
