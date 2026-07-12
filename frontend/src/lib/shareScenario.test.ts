// The plan 07 done-when, frontend half: user A copies a three-node chain and
// sends the text over chat; user B — empty project, none of A's environments
// or credentials — pastes it. Nodes appear with bindings intact, the wizard
// prompts to create the `staging` / `staging-admin` placeholders, and after
// applying, B only has to enter the credential value (Rotate) for the chain
// to run. The envelope here is shaped exactly like share/export.go emits a
// selection. The byte-level file half (export → import → re-export diffs
// only in the board ID) is TestCrossProjectRoundTrip in share/e2e_test.go.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from './api'
import { rotateCredentialSecret } from './credentialActions.svelte'
import { dialogs } from './dialogs.svelte'
import { applyImportMappings } from './importActions.svelte'
import type { EnvelopePayload, HttpNode } from './model'
import { pasteFromClipboard } from './shareActions'
import { app } from './state.svelte'

const chainEnvelope = (): EnvelopePayload => ({
  kind: 'selection',
  formatVersion: 1,
  app: 'cascade/0.1',
  board: {
    formatVersion: 1,
    id: '',
    name: '',
    nodes: [
      {
        id: 'n1',
        type: 'http',
        name: 'Create User',
        data: {
          name: 'Create User',
          key: 'createUser',
          method: 'POST',
          path: '/v1/users',
          environment: 'staging',
          credential: 'staging-admin',
          status: 'idle',
          repeat: 1,
          fields: [{ key: 'body.email', source: 'literal', value: 'a@b.c' }],
        },
      },
      {
        id: 'n2',
        type: 'http',
        name: 'Create Org',
        data: {
          name: 'Create Org',
          key: 'createOrg',
          method: 'POST',
          path: '/v1/orgs',
          environment: 'staging',
          credential: 'staging-admin',
          status: 'idle',
          repeat: 1,
          fields: [
            { key: 'body.ownerId', source: 'binding', value: 'n1.body.id', ref: { nodeId: 'n1', path: 'body.id' } },
          ],
        },
      },
      {
        id: 'n3',
        type: 'http',
        name: 'Create Project',
        data: {
          name: 'Create Project',
          key: 'createProject',
          method: 'POST',
          path: '/v1/projects',
          environment: 'staging',
          credential: 'staging-admin',
          status: 'idle',
          repeat: 1,
          fields: [
            { key: 'body.orgId', source: 'binding', value: 'res.body.id', ref: { nodeId: '', path: 'body.id' } },
            { key: 'body.name', source: 'template', value: 'proj-{{n1.body.id}}-{{i}}' },
          ],
        },
      },
    ],
    edges: [
      { id: 'e1', from: 'n1', to: 'n2' },
      { id: 'e2', from: 'n2', to: 'n3' },
    ],
    layout: { positions: { n1: { x: 0, y: 0 }, n2: { x: 260, y: 0 }, n3: { x: 520, y: 0 } } },
  },
  requires: {
    environments: ['staging'],
    credentials: [{ name: 'staging-admin', kind: 'bearer' }],
    sources: [],
  },
})

beforeEach(() => {
  // User B's machine: an open project with an empty board and none of A's names.
  app.project = {
    project: { id: 'pB', name: 'Receiver', defaults: {} },
    sources: [],
    environments: [],
    credentials: [],
    boards: [],
    collections: [],
  }
  app.boardId = 'bB'
  app.boardName = 'Main'
  app.nodes = []
  app.edges = []
})

afterEach(() => {
  dialogs.importMapping = null
  vi.restoreAllMocks()
})

describe('plan 07 done-when: chat-shared chain onto an empty project', () => {
  it('paste → wizard placeholders → chain ready to run once a value is entered', async () => {
    vi.spyOn(api, 'readClipboardEnvelope').mockResolvedValue({ found: true, payload: chainEnvelope() })

    // B pastes at the cursor.
    expect(await pasteFromClipboard(app, { x: 400, y: 300 })).toBe(true)
    const pasted = app.nodes as HttpNode[]
    expect(pasted).toHaveLength(3)
    expect(pasted.every((n) => n.selected)).toBe(true)
    expect(app.edges).toHaveLength(2)

    // Bindings survived: the structured ref and the template both point at
    // the pasted createUser's fresh id; the res sugar rides the edge.
    const [createUser, createOrg, createProject] = pasted
    expect(createOrg.data.fields[0].ref).toEqual({ nodeId: createUser.id, path: 'body.id' })
    expect(createProject.data.fields[0].ref).toEqual({ nodeId: '', path: 'body.id' })
    expect(createProject.data.fields[1].value).toBe(`proj-{{${createUser.id}.body.id}}-{{i}}`)
    // Relative layout is preserved around the paste target.
    expect(createOrg.position.x - createUser.position.x).toBe(260)

    // The wizard prompts for exactly A's environment and credential.
    expect(dialogs.importMapping?.rows).toEqual([
      { type: 'environment', name: 'staging' },
      { type: 'credential', name: 'staging-admin', kind: 'bearer' },
    ])

    // B accepts the default: create both placeholders.
    vi.spyOn(api, 'saveEnvironments').mockResolvedValue()
    vi.spyOn(api, 'saveCredentials').mockResolvedValue()
    const ctx = dialogs.importMapping!
    expect(
      await applyImportMappings(app, ctx.rows, [{ action: 'create' }, { action: 'create' }], ctx.nodeIds),
    ).toBeNull()
    expect(app.environments).toEqual([{ name: 'staging', baseUrl: '' }])
    expect(app.credentials.map((c) => [c.name, c.kind])).toEqual([['staging-admin', 'bearer']])
    // The nodes' references resolve as-is — placeholders carry the names.
    expect(pasted.every((n) => n.data.environment === 'staging')).toBe(true)

    // B enters the real credential value (Rotate) — the last done-when step
    // before the chain runs green.
    const secretSpy = vi.spyOn(api, 'setCredentialSecret').mockResolvedValue()
    expect(await rotateCredentialSecret('pB', 'staging-admin', 'real-token')).toBeNull()
    expect(secretSpy).toHaveBeenCalledWith('pB', 'staging-admin', 'real-token')
  })
})
