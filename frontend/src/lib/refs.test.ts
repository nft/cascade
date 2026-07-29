import { describe, expect, it } from 'vitest'
// The golden vectors live outside frontend/ on purpose: core/binding reads the
// same file, and a copy here would defeat the point of a shared contract.
import vectorsSource from '../../../core/testdata/binding_vectors.json?raw'
import type { AppNode, CapturedResponse, NodeExport, NodeField } from './model'
import {
  fieldDisplayValue,
  fieldRefs,
  isValidKey,
  keyByNodeId,
  nodeIdByKey,
  parseFieldInput,
  renderTemplate,
  resolveField,
  slugifyKey,
  stringify,
  uniqueKey,
  validateFieldRefs,
  type ResolveContext,
} from './refs'

const httpNode = (id: string, name: string, key: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name,
    key,
    method: 'POST',
    path: '/v1/x',
    environment: '',
    credential: '',
    status: 'idle',
    fields: [],
  },
})

const nodes = [
  httpNode('create-user-1', 'Create User', 'createUser'),
  httpNode('create-org-1', 'Create Org', 'createOrg'),
]

describe('node key slugs (plan 05 §9a)', () => {
  it('derives camelCase slugs from names', () => {
    expect(slugifyKey('Create User')).toBe('createUser')
    expect(slugifyKey('create-org')).toBe('createOrg')
    expect(slugifyKey('GET /v1/users/{id}')).toBe('gETV1UsersId')
    expect(slugifyKey('2 fast 2 furious')).toBe('fast2Furious')
    expect(slugifyKey('...')).toBe('node')
  })

  it('deduplicates against taken keys', () => {
    expect(uniqueKey('createUser', new Set())).toBe('createUser')
    expect(uniqueKey('createUser', new Set(['createUser']))).toBe('createUser2')
    expect(uniqueKey('createUser', new Set(['createUser', 'createUser2']))).toBe('createUser3')
  })

  it('rejects reserved roots and non-identifiers', () => {
    expect(isValidKey('res')).toBe(false)
    expect(isValidKey('i')).toBe(false)
    expect(isValidKey('1abc')).toBe(false)
    expect(isValidKey('a-b')).toBe(false)
    expect(isValidKey('createUser')).toBe(true)
    // reserved bases get suffixed instead of colliding with the sugar
    expect(uniqueKey('res', new Set())).toBe('res2')
  })
})

describe('key rename safety (plan 05 scope guard)', () => {
  const binding: NodeField = {
    key: 'body.owner_id',
    source: 'binding',
    value: 'create-user-1.body.id',
    ref: { nodeId: 'create-user-1', path: 'body.id' },
  }
  const template: NodeField = {
    key: 'body.greeting',
    source: 'template',
    value: 'welcome-{{create-user-1.body.name}}',
  }

  it('renders stored node IDs as keys', () => {
    const keys = keyByNodeId(nodes)
    expect(fieldDisplayValue(binding, keys)).toBe('createUser.body.id')
    expect(fieldDisplayValue(template, keys)).toBe('welcome-{{createUser.body.name}}')
  })

  it('renaming a key rewrites nothing stored, only the rendering', () => {
    const renamed = nodes.map((n) =>
      n.id === 'create-user-1' ? { ...n, data: { ...n.data, key: 'makeUser' } } : n,
    ) as AppNode[]
    // stored form is untouched by construction — same objects, no rewrite pass
    expect(binding.value).toBe('create-user-1.body.id')
    expect(binding.ref).toEqual({ nodeId: 'create-user-1', path: 'body.id' })
    expect(template.value).toBe('welcome-{{create-user-1.body.name}}')
    // …while the rendering follows the new key
    const keys = keyByNodeId(renamed)
    expect(fieldDisplayValue(binding, keys)).toBe('makeUser.body.id')
    expect(fieldDisplayValue(template, keys)).toBe('welcome-{{makeUser.body.name}}')
  })
})

describe('parseFieldInput (editor → stored form)', () => {
  const ids = nodeIdByKey(nodes)
  const knownIds = new Set(nodes.map((n) => n.id))
  const parse = (input: string) => parseFieldInput('body.x', input, ids, knownIds)

  it('whole-value key reference becomes an ID-backed binding', () => {
    expect(parse('createUser.body.id')).toEqual({
      key: 'body.x',
      source: 'binding',
      value: 'create-user-1.body.id',
      ref: { nodeId: 'create-user-1', path: 'body.id' },
    })
  })

  it('bare res accessor becomes a res binding', () => {
    expect(parse('res.name')).toEqual({
      key: 'body.x',
      source: 'binding',
      value: 'res.name',
      ref: { nodeId: '', path: 'name' },
    })
    expect(parse('res').ref).toEqual({ nodeId: '', path: '' })
  })

  it('a whole-field {{…}} normalizes to a structured binding', () => {
    expect(parse('{{createUser.body.id}}')).toEqual({
      key: 'body.x',
      source: 'binding',
      value: 'create-user-1.body.id',
      ref: { nodeId: 'create-user-1', path: 'body.id' },
    })
    // {{i}} has no node to bind to — it stays a template (and keeps its type)
    expect(parse('{{i}}').source).toBe('template')
    // unknown owners stay templates so validation can flag them
    expect(parse('{{ghost.body.id}}').source).toBe('template')
  })

  it('templates parse keys inside {{…}} back to node IDs', () => {
    expect(parse('welcome-{{createUser.body.name}}')).toEqual({
      key: 'body.x',
      source: 'template',
      value: 'welcome-{{create-user-1.body.name}}',
    })
    expect(parse('member+{{i}}@example.com').value).toBe('member+{{i}}@example.com')
  })

  it('plain text and unknown owners stay literal', () => {
    expect(parse('hello world').source).toBe('literal')
    expect(parse('nobody.body.id').source).toBe('literal')
    expect(parse('createUser').source).toBe('literal') // a key alone, no path — not a ref
    expect(parse('i').source).toBe('literal')
  })

  it('round-trips through fieldDisplayValue', () => {
    const keys = keyByNodeId(nodes)
    for (const input of ['createUser.body.id', 'res.name', 'welcome-{{createUser.body.name}}', 'plain']) {
      expect(fieldDisplayValue(parse(input), keys)).toBe(input)
    }
  })
})

describe('validateFieldRefs (edit-time, mirrors core/binding)', () => {
  const edges = [{ source: 'create-user-1', target: 'create-org-1' }]
  const orgField = (value: string, ref?: NodeField['ref']): NodeField => ({
    key: 'body.x',
    source: ref ? 'binding' : 'template',
    value,
    ref,
  })

  it('accepts ancestor refs and single-upstream res', () => {
    expect(
      validateFieldRefs(orgField('create-user-1.body.id', { nodeId: 'create-user-1', path: 'body.id' }), 'create-org-1', nodes, edges),
    ).toBeNull()
    expect(validateFieldRefs(orgField('res.name', { nodeId: '', path: 'name' }), 'create-org-1', nodes, edges)).toBeNull()
  })

  it('flags res with zero or several upstreams', () => {
    expect(validateFieldRefs(orgField('res.name', { nodeId: '', path: 'name' }), 'create-user-1', nodes, edges)).toMatch(
      /needs an upstream/,
    )
    const multi = [...edges, { source: 'x', target: 'create-org-1' }]
    expect(validateFieldRefs(orgField('res.name', { nodeId: '', path: 'name' }), 'create-org-1', nodes, multi)).toMatch(
      /ambiguous/,
    )
  })

  it('flags refs to non-ancestors and unknown nodes', () => {
    expect(
      validateFieldRefs(orgField('{{create-org-1.body.id}}'), 'create-user-1', nodes, edges),
    ).toMatch(/not an upstream ancestor/)
    expect(validateFieldRefs(orgField('{{ghost.body.id}}'), 'create-org-1', nodes, edges)).toMatch(/unknown node/)
  })

  // core/binding rejects both at run time while the resolver's regex treats
  // an unterminated {{ as literal text — so the editor has to say so first.
  it('flags template syntax core/binding will reject', () => {
    expect(validateFieldRefs(orgField('a-{{create-user-1.body.id'), 'create-org-1', nodes, edges)).toMatch(
      /unterminated/,
    )
    expect(validateFieldRefs(orgField('a-{{  }}-b'), 'create-org-1', nodes, edges)).toMatch(/empty reference/)
    expect(validateFieldRefs(orgField('{{create-user-1.body.id}} and }} alone'), 'create-org-1', nodes, edges)).toBeNull()
  })

  it('extracts refs from templates and bindings alike', () => {
    expect(fieldRefs(orgField('a-{{create-user-1.body.id}}-b-{{i}}-{{res.name}}'))).toEqual([
      { nodeId: 'create-user-1', path: 'body.id' },
      { nodeId: '', path: 'name' },
    ])
  })
})

describe('resolveField (mirrors core/binding resolution)', () => {
  const outputs: Record<string, CapturedResponse> = {
    'create-user-1': {
      status: 201,
      headers: { Location: '/v1/users/u1' },
      body: { id: 'u1', name: 'Ada', age: 36, status: 'pending', data: { attributes: { id: 'deep-1' } } },
      at: '2026-07-06T14:02:00Z',
    },
  }
  const ctx: ResolveContext = {
    outputs,
    exports: { 'create-user-1': [{ key: 'userId', path: 'body.data.attributes.id' }] },
    upstreams: ['create-user-1'],
    index: 3,
  }
  const binding = (nodeId: string, path: string): NodeField => ({
    key: 'k',
    source: 'binding',
    value: 'x',
    ref: { nodeId, path },
  })
  const template = (value: string): NodeField => ({ key: 'k', source: 'template', value })

  it('resolves res sugar, explicit prefixes and exports', () => {
    expect(resolveField(binding('', 'name'), ctx)).toBe('Ada')
    expect(resolveField(binding('', 'status'), ctx)).toBe(201)
    expect(resolveField(binding('', 'body.status'), ctx)).toBe('pending')
    expect(resolveField(binding('', 'headers.location'), ctx)).toBe('/v1/users/u1')
    expect(resolveField(binding('create-user-1', 'userId'), ctx)).toBe('deep-1')
  })

  it('preserves JSON types for whole-value templates, coerces in mixed text', () => {
    expect(resolveField(template('{{create-user-1.body.age}}'), ctx)).toBe(36)
    expect(resolveField(template('age: {{create-user-1.body.age}}'), ctx)).toBe('age: 36')
    expect(resolveField(template('member+{{i}}@example.com'), ctx)).toBe('member+3@example.com')
  })

  it('errors on ambiguous res and missing outputs', () => {
    expect(() => resolveField(binding('', 'name'), { ...ctx, upstreams: [] })).toThrow(/ambiguous/)
    expect(() => resolveField(binding('never-ran', 'body.id'), ctx)).toThrow(/not produced/)
    expect(() => resolveField(binding('create-user-1', 'body.nope'), ctx)).toThrow(/available keys/)
  })
})

describe('{{item}} loop scope (plan 09 N7, mirrors core/binding)', () => {
  const ctx: ResolveContext = {
    outputs: {},
    exports: {},
    upstreams: [],
    index: 1,
    item: { name: 'ada', tags: ['x', 'y'] },
    hasItem: true,
  }
  const template = (value: string): NodeField => ({ key: 'k', source: 'template', value })

  it('resolves the whole item, item paths and mixed text', () => {
    expect(resolveField(template('{{item}}'), ctx)).toEqual({ name: 'ada', tags: ['x', 'y'] })
    expect(resolveField(template('{{item.name}}'), ctx)).toBe('ada')
    expect(resolveField(template('{{item.tags[1]}}'), ctx)).toBe('y')
    expect(resolveField(template('u{{i}}-{{item.name}}'), ctx)).toBe('u1-ada')
  })

  it('resolves a bare primitive item', () => {
    expect(resolveField(template('{{item}}'), { ...ctx, item: 'foo' })).toBe('foo')
  })

  it('fails with a named error outside an each-mode loop', () => {
    expect(() =>
      resolveField(template('{{item.name}}'), { ...ctx, hasItem: false, item: undefined }),
    ).toThrow(/each-mode for loop/)
  })

  it('is a scope ref like i, never a node reference', () => {
    expect(fieldRefs(template('{{item.name}}-{{i}}'))).toEqual([])
  })
})

describe('[*] array map (plan 06 T3, mirrors core/binding goldens)', () => {
  const outputs: Record<string, CapturedResponse> = {
    'create-org-1': {
      status: 201,
      body: {
        orgs: [
          { id: 'o1', tags: ['a', 'b'] },
          { id: 'o2', tags: [] },
        ],
        empty: [],
        count: 2,
      },
      at: '2026-07-06T14:02:00Z',
    },
  }
  const ctx: ResolveContext = { outputs, exports: {}, upstreams: ['create-org-1'], index: 0 }
  const bind = (path: string): NodeField => ({
    key: 'k',
    source: 'binding',
    value: 'x',
    ref: { nodeId: 'create-org-1', path },
  })

  it('maps object paths over arrays', () => {
    expect(resolveField(bind('body.orgs[*].id'), ctx)).toEqual(['o1', 'o2'])
    expect(resolveField(bind('orgs[*].id'), ctx)).toEqual(['o1', 'o2'])
    expect(resolveField(bind('body.empty[*].id'), ctx)).toEqual([])
  })

  it('nests for nested [*] and errors on non-arrays / missing element paths', () => {
    expect(resolveField(bind('body.orgs[*].tags[*]'), ctx)).toEqual([['a', 'b'], []])
    expect(() => resolveField(bind('body.count[*]'), ctx)).toThrow(/needs an array/)
    expect(() => resolveField(bind('body.orgs[*].tags[0]'), ctx)).toThrow(/out of range/)
  })

  it('parses [*] references from the field editor', () => {
    const field = parseFieldInput('body.ids', 'createOrg.body.orgs[*].id', nodeIdByKey(nodes), new Set(nodes.map((n) => n.id)))
    expect(field.source).toBe('binding')
    expect(field.ref).toEqual({ nodeId: 'create-org-1', path: 'body.orgs[*].id' })
  })
})

// --- shared golden vectors (plan 11 D16) -------------------------------------

interface VectorOutput {
  status: number
  headers?: Record<string, string>
  body?: unknown
  truncated?: boolean
}

interface VectorCase {
  name: string
  /** Exactly one of template / ref is set; presence is the discriminator. */
  template?: string
  ref?: { node?: string; path?: string }
  /** Overrides the file-level upstreams for res-sugar cases. */
  upstreams?: string[]
  expect?: string
  type?: string
  error?: string
}

interface VectorFile {
  index: number
  upstreams: string[]
  exports: Record<string, NodeExport[]>
  outputs: Record<string, VectorOutput>
  cases: VectorCase[]
}

/** The JSON type names the vectors use; mirrors core/binding's jsonTypeName. */
function jsonTypeName(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

describe('binding vectors (plan 11 D16 — shared with core/binding)', () => {
  const vectors = JSON.parse(vectorsSource) as VectorFile
  const captureTime = '2026-07-06T14:02:00Z'
  const outputs: Record<string, CapturedResponse> = {}
  for (const [nodeId, out] of Object.entries(vectors.outputs)) {
    outputs[nodeId] = {
      status: out.status,
      headers: out.headers,
      body: out.body,
      at: captureTime,
      truncated: out.truncated,
    }
  }

  it('has cases', () => {
    expect(vectors.cases.length).toBeGreaterThan(0)
  })

  for (const vector of vectors.cases) {
    it(vector.name, () => {
      const ctx: ResolveContext = {
        outputs,
        exports: vectors.exports,
        upstreams: vector.upstreams ?? vectors.upstreams,
        index: vectors.index,
      }
      const field: NodeField = vector.template !== undefined
        ? { key: 'k', source: 'template', value: vector.template }
        : {
            key: 'k',
            source: 'binding',
            value: 'x',
            ref: { nodeId: vector.ref?.node ?? '', path: vector.ref?.path ?? '' },
          }
      if (vector.error !== undefined) {
        expect(() => resolveField(field, ctx)).toThrow(vector.error)
        return
      }
      const resolved = resolveField(field, ctx)
      if (vector.type !== undefined) expect(jsonTypeName(resolved)).toBe(vector.type)
      expect(stringify(resolved)).toBe(vector.expect)
    })
  }
})
