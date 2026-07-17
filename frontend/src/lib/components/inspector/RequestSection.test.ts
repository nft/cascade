import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HttpNode, RequestDef } from '../../model'
import { draftTarget, nodeTarget } from '../../requestEditor'
import { app } from '../../state.svelte'
import RequestSection from './RequestSection.svelte'

const mkNode = (data: Partial<HttpNode['data']> = {}): HttpNode => ({
  id: 'n1',
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: 'Node',
    key: 'node1',
    method: 'POST',
    path: '/v1/users/{id}',
    environment: 'staging',
    credential: '',
    status: 'idle',
    fields: [
      { key: 'body.email', source: 'literal', value: 'ada@example.com' },
      { key: 'header.X-Api-Key', source: 'literal', value: 'k' },
      { key: 'query.limit', source: 'literal', value: '20' },
    ],
    ...data,
  },
})

let instance: ReturnType<typeof mount> | null = null

function mountWith(node: HttpNode) {
  document.body.innerHTML = ''
  app.nodes = [node]
  app.edges = []
  instance = mount(RequestSection, { target: document.body, props: { target: nodeTarget(node) } })
  flushSync()
}

function mountDraft(draft: RequestDef) {
  document.body.innerHTML = ''
  app.nodes = []
  app.edges = []
  instance = mount(RequestSection, { target: document.body, props: { target: draftTarget(draft) } })
  flushSync()
}

const tabButton = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
    b.textContent?.includes(label),
  )

// Displayed field names on the visible tab: read-only path keys render as
// text, everything else as a key input (plan 10 §3b).
const rowKeys = () => [
  ...[...document.querySelectorAll<HTMLElement>('p[title^="name comes from"]')].map((p) =>
    p.textContent?.trim(),
  ),
  ...[...document.querySelectorAll<HTMLInputElement>('input[aria-label^="Field name"]')].map(
    (i) => i.value,
  ),
]

const keyInput = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[aria-label="Field name ${name}"]`)

const ghostKeyInput = () => document.querySelector<HTMLInputElement>('input[aria-label="New field name"]')!
const ghostValueInput = () => document.querySelector<HTMLInputElement>('input[aria-label="New field value"]')!

function setInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  flushSync()
}

function commitKeyInput(input: HTMLInputElement, value: string) {
  input.value = value
  input.dispatchEvent(new Event('change', { bubbles: true }))
  flushSync()
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
})

describe('RequestSection (plan 08 A2)', () => {
  it('groups prefixed fields into Params/Headers/Body tabs with counts', () => {
    mountWith(mkNode())
    expect(tabButton('Params')?.textContent).toContain('2') // placeholder id + query.limit
    expect(tabButton('Headers')?.textContent).toContain('1')
    expect(tabButton('Body')?.textContent).toContain('1')

    // Params is the default tab: placeholder row seeded even though unstored.
    expect(rowKeys()).toContain('id')
    expect(rowKeys()).toContain('limit')

    tabButton('Headers')!.click()
    flushSync()
    expect(rowKeys()).toEqual(['X-Api-Key'])

    tabButton('Body')!.click()
    flushSync()
    expect(rowKeys()).toEqual(['email'])
  })

  it('the ghost row auto-prefixes the typed name for its section', () => {
    const node = mkNode()
    mountWith(node)
    tabButton('Body')!.click()
    flushSync()
    setInput(ghostKeyInput(), 'user.name')
    ghostKeyInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    const updated = app.nodes[0] as HttpNode
    expect(updated.data.fields.map((f) => f.key)).toContain('body.user.name')
    // committed: the ghost resets for the next field
    expect(ghostKeyInput().value).toBe('')
  })

  it('the ghost row routes a params name matching a placeholder to path.* (plan 10 §3b)', () => {
    const node = mkNode({ fields: [] })
    mountWith(node)
    setInput(ghostKeyInput(), 'id')
    setInput(ghostValueInput(), 'u_42')
    ghostValueInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    const updated = app.nodes[0] as HttpNode
    expect(updated.data.fields).toEqual([{ key: 'path.id', source: 'literal', value: 'u_42' }])
  })

  it('placeholder-derived path rows have read-only keys (plan 10 §3b)', () => {
    mountWith(mkNode())
    expect(keyInput('id')).toBeNull()
    expect(document.querySelector('p[title^="name comes from"]')?.textContent?.trim()).toBe('id')
    // query rows stay editable
    expect(keyInput('limit')).not.toBeNull()
  })

  it('renaming a field keeps its value and row position (plan 10 §3b)', () => {
    const node = mkNode({
      fields: [
        { key: 'header.A', source: 'literal', value: '1' },
        { key: 'header.B', source: 'literal', value: '2' },
        { key: 'header.C', source: 'literal', value: '3' },
      ],
    })
    mountWith(node)
    tabButton('Headers')!.click()
    flushSync()
    commitKeyInput(keyInput('B')!, 'X-Renamed')
    const updated = app.nodes[0] as HttpNode
    expect(updated.data.fields.map((f) => f.key)).toEqual(['header.A', 'header.X-Renamed', 'header.C'])
    expect(updated.data.fields[1].value).toBe('2')
  })

  it('rejects a rename that collides with an existing key and reverts the input', () => {
    const node = mkNode({
      fields: [
        { key: 'header.A', source: 'literal', value: '1' },
        { key: 'header.B', source: 'literal', value: '2' },
      ],
    })
    mountWith(node)
    tabButton('Headers')!.click()
    flushSync()
    commitKeyInput(keyInput('B')!, 'A')
    const updated = app.nodes[0] as HttpNode
    expect(updated.data.fields.map((f) => f.key)).toEqual(['header.A', 'header.B'])
    expect(keyInput('B')!.value).toBe('B')
  })

  it('renaming a query param to a current placeholder re-routes it to path.*', () => {
    const node = mkNode({ fields: [{ key: 'query.userId', source: 'literal', value: 'u_1' }] })
    mountWith(node)
    commitKeyInput(keyInput('userId')!, 'id')
    const updated = app.nodes[0] as HttpNode
    expect(updated.data.fields).toEqual([{ key: 'path.id', source: 'literal', value: 'u_1' }])
  })

  it('raw → fields → raw round-trips the payload through the session stash (plan 10 §3c)', () => {
    const node = mkNode({
      fields: [],
      rawBody: { contentType: 'application/json', text: '{"answer": 42}' },
    })
    mountWith(node)
    tabButton('Body')!.click()
    flushSync()
    const toggle = (label: string) =>
      [...document.querySelectorAll<HTMLButtonElement>('button')].find(
        (b) => b.textContent?.trim() === label,
      )!
    toggle('fields').click()
    flushSync()
    expect((app.nodes[0] as HttpNode).data.rawBody).toBeUndefined()
    toggle('raw').click()
    flushSync()
    expect((app.nodes[0] as HttpNode).data.rawBody).toEqual({
      contentType: 'application/json',
      text: '{"answer": 42}',
    })
  })

  it('hides the Body tab for GET and falls back to Params', () => {
    mountWith(mkNode({ method: 'GET' }))
    expect(tabButton('Body')).toBeUndefined()
    expect(tabButton('Params')?.getAttribute('aria-selected')).toBe('true')
  })

  it('flags stored path rows without a matching placeholder as unused', () => {
    mountWith(
      mkNode({
        path: '/v1/users',
        fields: [{ key: 'path.id', source: 'literal', value: 'u_1' }],
      }),
    )
    expect(document.body.textContent).toContain('unused')
    // orphans lost their path owner, so their key becomes editable again
    expect(keyInput('id')).not.toBeNull()
  })
})

describe('RequestSection over a library draft (plan 08 B3)', () => {
  const mkDraft = (draft: Partial<RequestDef> = {}): RequestDef => ({
    id: 'req-1',
    name: 'Create invoice',
    protocol: 'http',
    method: 'POST',
    url: '/v1/invoices/{id}',
    defaults: [{ key: 'body.amount', source: 'literal', value: '100' }],
    ...draft,
  })

  it('is literal-only: no binding pickers, but raw bodies are allowed (plan 10 §3c)', () => {
    const draft = mkDraft()
    mountDraft(draft)
    expect(document.querySelector('[aria-label^="Insert reference"]')).toBeNull()
    tabButton('Body')!.click()
    flushSync()
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    const rawToggle = buttons.find((b) => b.textContent?.trim() === 'raw')
    expect(rawToggle).toBeDefined()
    rawToggle!.click()
    flushSync()
    expect(draft.rawBody).toEqual({ contentType: 'application/json', text: '' })
    // still no reference picker, even in the raw editor
    expect(document.querySelector('[aria-label^="Insert reference"]')).toBeNull()
  })

  it('seeds Params rows from {placeholders} in the full URL', () => {
    mountDraft(mkDraft({ url: 'https://api.example.com/v1/invoices/{id}' }))
    expect(rowKeys()).toContain('id')
  })

  it('the ghost row writes an auto-prefixed default onto the draft', () => {
    const draft = mkDraft()
    mountDraft(draft)
    tabButton('Body')!.click()
    flushSync()
    setInput(ghostKeyInput(), 'user.name')
    ghostKeyInput().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    expect(draft.defaults?.map((d) => d.key)).toContain('body.user.name')
    expect(app.nodes).toHaveLength(0) // nothing touched the board
  })

  it('renames rewrite draft defaults in place', () => {
    const draft = mkDraft({
      defaults: [
        { key: 'body.amount', source: 'literal', value: '100' },
        { key: 'body.currency', source: 'literal', value: 'EUR' },
      ],
    })
    mountDraft(draft)
    tabButton('Body')!.click()
    flushSync()
    commitKeyInput(keyInput('amount')!, 'total')
    expect(draft.defaults?.map((d) => d.key)).toEqual(['body.total', 'body.currency'])
    expect(draft.defaults?.[0].value).toBe('100')
  })
})
