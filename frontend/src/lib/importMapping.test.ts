import { describe, expect, it } from 'vitest'
import {
  mergeCollections,
  placeholderCredential,
  renameNodeTargets,
  unmatchedRequirements,
} from './importMapping'
import type {
  AppNode,
  CollectionDef,
  CredentialDef,
  EnvelopeRequires,
  EnvironmentDef,
  RequestDef,
} from './model'

const envs: EnvironmentDef[] = [{ name: 'staging', baseUrl: 'https://staging.x' }]
const creds: CredentialDef[] = [{ name: 'staging-admin', kind: 'bearer', createdAt: 't' }]

const requires = (over: Partial<EnvelopeRequires> = {}): EnvelopeRequires => ({
  environments: [],
  credentials: [],
  sources: [],
  ...over,
})

describe('unmatchedRequirements (plan 07 E4)', () => {
  it('auto-matches by exact name — matched entries produce no rows', () => {
    const rows = unmatchedRequirements(
      requires({ environments: ['staging'], credentials: [{ name: 'staging-admin', kind: 'bearer' }] }),
      envs,
      creds,
    )
    expect(rows).toEqual([])
  })

  it('lists unmatched environments and credentials with their kind hints', () => {
    const rows = unmatchedRequirements(
      requires({
        environments: ['staging', 'prod'],
        credentials: [{ name: 'prod-admin', kind: 'basic' }, { name: 'staging-admin' }],
      }),
      envs,
      creds,
    )
    expect(rows).toEqual([
      { type: 'environment', name: 'prod' },
      { type: 'credential', name: 'prod-admin', kind: 'basic' },
    ])
  })

  it('handles an absent requires block (cancelled import result)', () => {
    expect(unmatchedRequirements(undefined, envs, creds)).toEqual([])
  })
})

describe('placeholderCredential', () => {
  it('keeps standalone-valid kind hints', () => {
    expect(placeholderCredential('a', 'basic', 't').kind).toBe('basic')
    expect(placeholderCredential('a', 'bearer', 't').kind).toBe('bearer')
  })

  it('falls back to bearer when the hint needs fields the envelope has no room for', () => {
    // header/query kinds require a header/param name, which requires.credentials
    // never carries — the user adjusts the kind when entering the value.
    expect(placeholderCredential('a', 'header', 't').kind).toBe('bearer')
    expect(placeholderCredential('a', 'query', 't').kind).toBe('bearer')
    expect(placeholderCredential('a', undefined, 't').kind).toBe('bearer')
  })
})

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

describe('renameNodeTargets', () => {
  const nodes: AppNode[] = [
    httpNode('a', 'prod', 'prod-admin'),
    httpNode('b', 'prod', ''),
    { id: 'c', type: 'note', position: { x: 0, y: 0 }, data: { text: 'hi' } },
  ]

  it('rewrites environment and credential references on the listed nodes only', () => {
    const out = renameNodeTargets(nodes, new Set(['a']), [
      { type: 'environment', from: 'prod', to: 'staging' },
      { type: 'credential', from: 'prod-admin', to: 'staging-admin' },
    ])
    expect(out[0].data).toMatchObject({ environment: 'staging', credential: 'staging-admin' })
    // b was not part of the import; c is a note without targets.
    expect(out[1].data).toMatchObject({ environment: 'prod' })
    expect(out[2]).toBe(nodes[2])
  })

  it('leaves untouched nodes referentially identical (no spurious canvas updates)', () => {
    const out = renameNodeTargets(nodes, new Set(['a', 'b', 'c']), [
      { type: 'credential', from: 'prod-admin', to: 'staging-admin' },
    ])
    expect(out[0]).not.toBe(nodes[0])
    expect(out[1]).toBe(nodes[1]) // references nothing that was renamed
  })
})

const request = (id: string): RequestDef => ({ id, name: id, protocol: 'http', method: 'GET', url: `/v1/${id}` })

const collection = (id: string, requests: RequestDef[], name = id): CollectionDef => ({
  id,
  name,
  root: { id: 'root', name: '', requests },
})

describe('mergeCollections (plan 07 E5)', () => {
  it('imports unknown collections as-is', () => {
    const embedded = [collection('col9', [request('r1')])]
    expect(mergeCollections([], embedded)).toEqual(embedded)
  })

  it('appends only the missing requests to a known collection', () => {
    const existing = [
      {
        ...collection('col1', []),
        root: {
          id: 'root',
          name: '',
          requests: [request('r1')],
          folders: [{ id: 'f1', name: 'sub', requests: [request('r2')] }],
        },
      },
    ]
    const merged = mergeCollections(existing, [collection('col1', [request('r1'), request('r2'), request('r3')])])
    expect(merged).toHaveLength(1)
    // r1 (root) and r2 (inside a folder) already exist — only r3 lands.
    expect(merged[0].root.requests.map((r) => r.id)).toEqual(['r1', 'r3'])
  })

  it('reports nothing to save when every embedded request is already present', () => {
    const existing = [collection('col1', [request('r1')])]
    expect(mergeCollections(existing, [collection('col1', [request('r1')])])).toEqual([])
    expect(mergeCollections(existing, undefined)).toEqual([])
  })
})
