import { describe, expect, it } from 'vitest'
import type {
  AppEdge,
  AppNode,
  CapturedResponse,
  DelayNode,
  HttpNode,
  NodeExport,
  NodeField,
  TransformNode,
} from './model'
import {
  EMPTY_EXPR_LABEL,
  EMPTY_SCRIPT_LABEL,
  bodyShape,
  capturedBodyShape,
  exportKeys,
  formatEdgeLabel,
  httpBodyShape,
  httpInputRefs,
  isResultStale,
  nodeSendKeys,
  pickRowSummaries,
  scriptSummary,
  transformOutputKeys,
  withOverflow,
} from './nodeIO'
import { inferSchema } from './schema'
import { DEFAULT_TRANSFORM_SCRIPT } from './transform'

const binding = (key: string, nodeId: string, path: string): NodeField => ({
  key,
  source: 'binding',
  value: `${nodeId}.${path}`,
  ref: { nodeId, path },
})

const literal = (key: string, value: string): NodeField => ({ key, source: 'literal', value })

const template = (key: string, value: string): NodeField => ({ key, source: 'template', value })

function httpNode(id: string, fields: NodeField[], extra: Partial<HttpNode['data']> = {}): HttpNode {
  return {
    id,
    type: 'http',
    position: { x: 0, y: 0 },
    data: {
      name: id,
      key: id,
      method: 'GET',
      path: '/v1/things',
      environment: 'staging',
      credential: '',
      status: 'idle',
      fields,
      ...extra,
    },
  }
}

function transformNode(id: string, pick: NodeField[], extra: Partial<TransformNode['data']> = {}): TransformNode {
  return {
    id,
    type: 'transform',
    position: { x: 0, y: 0 },
    data: { name: id, key: id, status: 'idle', mode: 'pick', pick, script: '', ...extra },
  }
}

function delayNode(id: string, exports: NodeExport[] = []): DelayNode {
  return {
    id,
    type: 'delay',
    position: { x: 0, y: 0 },
    data: { name: id, key: id, status: 'idle', durationMs: 1000, exports },
  }
}

const edge = (source: string, target: string): AppEdge => ({ id: `${source}->${target}`, source, target })

const captured = (body: unknown, truncated = false, at = '2026-01-01T12:00:00Z'): CapturedResponse => ({
  status: 200,
  body,
  at,
  truncated,
})

const KEYS = new Map([
  ['n1', 'createUser'],
  ['n2', 'listOrgs'],
])

describe('withOverflow', () => {
  it('splits into a shown head and a remainder count', () => {
    expect(withOverflow(['a', 'b', 'c'], 2)).toEqual({ shown: ['a', 'b'], more: 1 })
    expect(withOverflow(['a'], 2)).toEqual({ shown: ['a'], more: 0 })
    expect(withOverflow([], 2)).toEqual({ shown: [], more: 0 })
  })
})

describe('httpInputRefs', () => {
  it('renders bindings and template refs by node key, deduped in field order', () => {
    const node = httpNode('n3', [
      binding('orgId', 'n2', 'body.id'),
      literal('page', '1'),
      template('note', 'from {{n1.body.name}} and {{n2.body.id}}'),
    ])
    expect(httpInputRefs(node.data, KEYS)).toEqual(['listOrgs.body.id', 'createUser.body.name'])
  })

  it('renders the res sugar unchanged', () => {
    expect(httpInputRefs(httpNode('n3', [binding('id', '', 'body.id')]).data, KEYS)).toEqual(['res.body.id'])
  })

  it('scans the raw body, which templates like any other field', () => {
    const node = httpNode('n3', [], { rawBody: { contentType: 'text/csv', text: 'id\n{{n1.body.id}}' } })
    expect(httpInputRefs(node.data, KEYS)).toEqual(['createUser.body.id'])
  })

  it('is empty for a request that binds nothing', () => {
    expect(httpInputRefs(httpNode('n3', [literal('page', '1')]).data, KEYS)).toEqual([])
  })
})

describe('transformOutputKeys', () => {
  it("offers a pick row's top-level key, since that is where a reference starts", () => {
    const node = transformNode('n1', [literal('user.id', 'x'), literal('user.name', 'y'), literal('total', 'z')])
    expect(transformOutputKeys(node.data)).toEqual(['user', 'total'])
  })

  it('lists declared exports before pick keys, without duplicating them', () => {
    const node = transformNode('n1', [literal('total', 'z')], {
      exports: [
        { key: 'total', path: 'body.total' },
        { key: 'first', path: 'body.rows[0]' },
      ],
    })
    expect(transformOutputKeys(node.data)).toEqual(['total', 'first'])
  })

  it('offers only exports in script mode, where rows are not the output shape', () => {
    const node = transformNode('n1', [literal('unused', 'z')], { mode: 'script', script: 'return res.body' })
    expect(transformOutputKeys(node.data)).toEqual([])
  })
})

describe('exportKeys', () => {
  it('is empty when a node declares no exports', () => {
    expect(exportKeys(httpNode('n1', []).data)).toEqual([])
  })
})

describe('nodeSendKeys', () => {
  const sends = (node: AppNode, nodes: AppNode[] = [node], edges: AppEdge[] = []) =>
    nodeSendKeys(node, nodes, edges)

  it("is a request node's declared exports", () => {
    const node = httpNode('n1', [], { exports: [{ key: 'userId', path: 'body.data.id' }] })
    expect(sends(node)).toEqual(['userId'])
  })

  it("folds a transform's pick keys in with its exports", () => {
    const node = transformNode('n1', [literal('test', 'x')], { exports: [{ key: 'title', path: 'Title' }] })
    expect(sends(node)).toEqual(['title', 'test'])
  })

  it('is empty for a node that names nothing, and for a note', () => {
    expect(sends(httpNode('n1', []))).toEqual([])
    const note: AppNode = { id: 'n2', type: 'note', position: { x: 0, y: 0 }, data: { text: 'hi' } }
    expect(sends(note)).toEqual([])
  })

  it('sends its upstream names on through a delay, and through a chain of them', () => {
    const source = httpNode('src', [], { exports: [{ key: 'userId', path: 'body.id' }] })
    const first = delayNode('d1')
    const second = delayNode('d2')
    const nodes = [source, first, second]
    const edges = [edge('src', 'd1'), edge('d1', 'd2')]
    expect(sends(first, nodes, edges)).toEqual(['userId'])
    expect(sends(second, nodes, edges)).toEqual(['userId'])
  })

  it("puts a delay's own exports before what passes through it, deduped", () => {
    const source = httpNode('src', [], { exports: [{ key: 'userId', path: 'body.id' }] })
    const wait = delayNode('d1', [
      { key: 'id', path: 'body.id' },
      { key: 'userId', path: 'body.id' },
    ])
    expect(sends(wait, [source, wait], [edge('src', 'd1')])).toEqual(['id', 'userId'])
  })

  it('sends nothing through a delay that gates zero or several upstreams', () => {
    const a = httpNode('a', [], { exports: [{ key: 'userId', path: 'body.id' }] })
    const b = httpNode('b', [], { exports: [{ key: 'orgId', path: 'body.id' }] })
    const wait = delayNode('d1')
    expect(sends(wait, [a, b, wait], [])).toEqual([])
    // A delay joins nothing: with two upstreams its output is a null body.
    expect(sends(wait, [a, b, wait], [edge('a', 'd1'), edge('b', 'd1')])).toEqual([])
  })
})

describe('formatEdgeLabel', () => {
  it('spells out the first names and counts the rest', () => {
    expect(formatEdgeLabel(['title'])).toBe('title')
    expect(formatEdgeLabel(['title', 'test'])).toBe('title, test')
    expect(formatEdgeLabel(['title', 'test', 'userId', 'orgId'])).toBe('title, test +2')
  })
})

describe('bodyShape', () => {
  it("lists an object body's top-level keys with their types", () => {
    expect(bodyShape(inferSchema({ id: 1, title: 'x', done: false }))).toEqual({
      type: 'object',
      fields: [
        { key: 'done', type: 'boolean' },
        { key: 'id', type: 'integer' },
        { key: 'title', type: 'string' },
      ],
    })
  })

  it('describes an array through one element, since that is the useful shape', () => {
    expect(bodyShape(inferSchema([{ id: 1, title: 'x' }]))).toEqual({
      type: 'array of object',
      fields: [
        { key: 'id', type: 'integer' },
        { key: 'title', type: 'string' },
      ],
    })
  })

  it('carries a format annotation through', () => {
    const shape = bodyShape(inferSchema({ id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' }))
    expect(shape.fields).toEqual([{ key: 'id', type: 'string · uuid' }])
  })

  it('has no fields for a scalar body', () => {
    expect(bodyShape(inferSchema('hello'))).toEqual({ type: 'string', fields: [] })
  })
})

describe('httpBodyShape', () => {
  it('prefers the pinned schema over the last response', () => {
    const node = httpNode('n1', [], { responseSchema: inferSchema({ pinned: true }) })
    expect(httpBodyShape(node.data, captured({ inferred: 1 }))?.fields).toEqual([
      { key: 'pinned', type: 'boolean' },
    ])
  })

  it('falls back to inferring from the last response', () => {
    expect(httpBodyShape(httpNode('n1', []).data, captured({ inferred: 1 }))?.fields).toEqual([
      { key: 'inferred', type: 'integer' },
    ])
  })

  it('shows nothing before a schema or a run exists', () => {
    expect(httpBodyShape(httpNode('n1', []).data, undefined)).toBeNull()
  })

  it('shows nothing when the capture was truncated, since there is no body to read', () => {
    expect(httpBodyShape(httpNode('n1', []).data, captured(null, true))).toBeNull()
  })
})

describe('scriptSummary', () => {
  it('shows the return line, not a line count, so the seed script reads as what it does', () => {
    expect(scriptSummary(DEFAULT_TRANSFORM_SCRIPT)).toEqual({ line: 'return res.body', empty: false })
  })

  it('shows an authored return past the seed comments', () => {
    expect(scriptSummary('// Inputs: res\n// helpers\nreturn 5\n').line).toBe('return 5')
  })

  it('says the script is empty when nothing but comments and blanks is left', () => {
    for (const script of ['', '   \n\n', '// just a note\n\n/* and a block */\n * cont\n']) {
      expect(scriptSummary(script)).toEqual({ line: EMPTY_SCRIPT_LABEL, empty: true })
    }
  })

  it('takes the last return of several, the payload being the one at the end', () => {
    const script = 'const x = res.body\nif (!x) return null\nreturn { id: x.id }'
    expect(scriptSummary(script).line).toBe('return { id: x.id }')
  })

  it('falls back to the last statement when the script returns nothing', () => {
    expect(scriptSummary('const x = 1\nnodes.log(x)').line).toBe('nodes.log(x)')
  })

  it('does not mistake a // inside a string for a comment', () => {
    expect(scriptSummary("return { url: 'https://x.io/a' }").line).toBe("return { url: 'https://x.io/a' }")
  })

  it('reads a return that only differs from an identifier by the keyword boundary', () => {
    // `returnValue = 1` is not a return statement; the last statement stands in.
    expect(scriptSummary('returnValue = 1').line).toBe('returnValue = 1')
  })
})

describe('capturedBodyShape', () => {
  it('reads the shape of what a transform last returned', () => {
    expect(capturedBodyShape(captured({ id: 1, name: 'a' }))).toEqual({
      type: 'object',
      fields: [
        { key: 'id', type: 'integer' },
        { key: 'name', type: 'string' },
      ],
    })
  })

  it('describes a scalar return with its type alone', () => {
    expect(capturedBodyShape(captured(5))).toEqual({ type: 'integer', fields: [] })
  })

  it('shows nothing before a run, or when the capture was truncated', () => {
    expect(capturedBodyShape(undefined)).toBeNull()
    expect(capturedBodyShape(captured(null, true))).toBeNull()
  })

  it('walks one capture once', () => {
    const capture = captured({ id: 1 })
    expect(capturedBodyShape(capture)).toBe(capturedBodyShape(capture))
  })
})

describe('isResultStale', () => {
  const CAPTURED_AT = '2026-07-06T14:02:00.000Z'

  it('marks a shape captured before the last edit', () => {
    expect(isResultStale(captured(1, false, CAPTURED_AT), '2026-07-06T14:03:00.000Z')).toBe(true)
  })

  it('leaves a shape captured after the last edit alone', () => {
    expect(isResultStale(captured(1, false, CAPTURED_AT), '2026-07-06T14:01:00.000Z')).toBe(false)
    // An edit and a capture at the same instant: the run carried that edit.
    expect(isResultStale(captured(1, false, CAPTURED_AT), CAPTURED_AT)).toBe(false)
  })

  it('claims nothing without a capture or an edit time', () => {
    expect(isResultStale(undefined, '2026-07-06T14:03:00.000Z')).toBe(false)
    expect(isResultStale(captured(1, false, CAPTURED_AT), undefined)).toBe(false)
  })

  it('compares instants, not text, so a coarser timestamp still orders correctly', () => {
    // '…14:02:00Z' > '…14:02:00.500Z' lexically, but the edit came later.
    expect(isResultStale(captured(1, false, '2026-07-06T14:02:00Z'), '2026-07-06T14:02:00.500Z')).toBe(true)
  })

  it('claims nothing when a timestamp cannot be read', () => {
    expect(isResultStale(captured(1, false, 'not a date'), '2026-07-06T14:03:00.000Z')).toBe(false)
    expect(isResultStale(captured(1, false, CAPTURED_AT), 'whenever')).toBe(false)
  })
})

describe('pickRowSummaries', () => {
  it('pairs each row key with its expression in display form', () => {
    const rows = [binding('title', 'n1', 'body.title'), template('label', '#{{n2.body.id}}')]
    expect(pickRowSummaries(rows, KEYS)).toEqual([
      { key: 'title', expr: 'createUser.body.title' },
      { key: 'label', expr: '#{{listOrgs.body.id}}' },
    ])
  })

  it('marks a row whose expression is still empty', () => {
    expect(pickRowSummaries([literal('title', '')], KEYS)).toEqual([{ key: 'title', expr: EMPTY_EXPR_LABEL }])
  })
})
