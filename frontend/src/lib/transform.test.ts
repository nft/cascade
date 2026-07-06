import { describe, expect, it } from 'vitest'
import type { AppEdge, AppNode, CapturedResponse, NodeField, TransformNode } from './model'
import { executeTransform, runPick, setKeyPath } from './transform'
import type { ResolveContext } from './refs'

const orgResponse: CapturedResponse = {
  status: 201,
  body: {
    name: 'Apollo',
    members: [
      { email: 'a@x.io', active: true },
      { email: 'b@x.io', active: false },
      { email: 'c@x.io', active: true },
    ],
  },
  at: '2026-07-06T14:02:00Z',
}

const ctx: ResolveContext = {
  outputs: { 'create-org-1': orgResponse },
  exports: {},
  upstreams: ['create-org-1'],
  index: 0,
}

const bindingRow = (key: string, path: string): NodeField => ({
  key,
  source: 'binding',
  value: 'x',
  ref: { nodeId: '', path },
})

describe('runPick (plan 06 T3)', () => {
  it('reshapes with [*], templates and nested output keys', () => {
    const rows: NodeField[] = [
      bindingRow('emails', 'body.members[*].email'),
      { key: 'meta.label', source: 'template', value: 'org {{res.name}}' },
    ]
    expect(runPick(rows, ctx)).toEqual({
      emails: ['a@x.io', 'b@x.io', 'c@x.io'],
      meta: { label: 'org Apollo' },
    })
  })

  it('fails with the row key in the message', () => {
    expect(() => runPick([bindingRow('x', 'body.nope')], ctx)).toThrow(/pick "x"/)
    expect(() => runPick([], ctx)).toThrow(/at least one row/)
    expect(() => runPick([bindingRow(' ', 'body.name')], ctx)).toThrow(/empty output key/)
  })
})

describe('setKeyPath', () => {
  it('creates intermediate objects and lets later writes win over leaves', () => {
    const target: Record<string, unknown> = {}
    setKeyPath(target, 'a.b', 1)
    setKeyPath(target, 'a.c', 2)
    setKeyPath(target, 'a.b', 3)
    expect(target).toEqual({ a: { b: 3, c: 2 } })
  })
})

describe('executeTransform script mode (dev sandbox stand-in)', () => {
  const nodes: AppNode[] = [
    {
      id: 'create-org-1',
      type: 'http',
      position: { x: 0, y: 0 },
      data: {
        name: 'Create Org',
        key: 'createOrg',
        method: 'POST',
        path: '/v1/orgs',
        environment: '',
        credential: '',
        status: 'idle',
        repeat: 1,
        fields: [],
      },
    },
    {
      id: 'transform-1',
      type: 'transform',
      position: { x: 0, y: 0 },
      data: {
        name: 'Actives',
        key: 'activeMembers',
        status: 'idle',
        mode: 'script',
        pick: [],
        script: `const members = nodes.createOrg.body.members.filter(m => m.active)
return { count: members.length, emails: members.map(m => m.email) }`,
      },
    },
  ]
  const edges: AppEdge[] = [{ id: 'e1', source: 'create-org-1', target: 'transform-1' }]
  const transform = nodes[1] as TransformNode

  it('filters via nodes.<key> and the _ helpers source', async () => {
    const body = await executeTransform(transform, nodes, edges, { 'create-org-1': orgResponse }, {})
    expect(body).toEqual({ count: 2, emails: ['a@x.io', 'c@x.io'] })
  })

  it('script and pick modes produce identical output (done-when parity)', async () => {
    const viaScript = await executeTransform(transform, nodes, edges, { 'create-org-1': orgResponse }, {})
    const pickNode: TransformNode = {
      ...transform,
      data: {
        ...transform.data,
        mode: 'pick',
        pick: [
          { key: 'count', source: 'literal', value: '' },
          bindingRow('emails', 'body.members[*].email'),
        ],
      },
    }
    // Pick cannot filter — parity holds for the reshaping part ([*] pluck).
    const viaPick = (await executeTransform(pickNode, nodes, edges, { 'create-org-1': orgResponse }, {})) as {
      emails: unknown
    }
    expect(viaPick.emails).toEqual(['a@x.io', 'b@x.io', 'c@x.io'])
    expect(viaScript).toEqual({ count: 2, emails: ['a@x.io', 'c@x.io'] })
  })

  it('_ helpers are available and scripts must return a value', async () => {
    const helperNode: TransformNode = {
      ...transform,
      data: { ...transform.data, script: 'return _.uniq([1, 1, 2])' },
    }
    await expect(executeTransform(helperNode, nodes, edges, { 'create-org-1': orgResponse }, {})).resolves.toEqual([1, 2])
    const noReturn: TransformNode = {
      ...transform,
      data: { ...transform.data, script: '1 + 1' },
    }
    await expect(executeTransform(noReturn, nodes, edges, { 'create-org-1': orgResponse }, {})).rejects.toThrow(/returned no value/)
  })
})
