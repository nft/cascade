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

const rowKeys = () =>
  [...document.querySelectorAll<HTMLElement>('p.font-mono')].map((p) => p.textContent?.trim())

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
    expect(rowKeys()).toContain('path.id')
    expect(rowKeys()).toContain('query.limit')

    tabButton('Headers')!.click()
    flushSync()
    expect(rowKeys()).toEqual(['header.X-Api-Key'])

    tabButton('Body')!.click()
    flushSync()
    expect(rowKeys()).toEqual(['body.email'])
  })

  it('adding in a section auto-prefixes the typed name', () => {
    const node = mkNode()
    mountWith(node)
    tabButton('Body')!.click()
    flushSync()
    const input = document.querySelector<HTMLInputElement>('input[placeholder*="nests"]')!
    input.value = 'user.name'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    const updated = app.nodes[0] as HttpNode
    expect(updated.data.fields.map((f) => f.key)).toContain('body.user.name')
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

  it('is literal-only: no binding pickers, no raw-body toggle', () => {
    mountDraft(mkDraft())
    expect(document.querySelector('[aria-label^="Insert reference"]')).toBeNull()
    const buttons = [...document.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons.some((b) => b.textContent?.trim() === 'raw')).toBe(false)
    expect(document.body.textContent).toContain('literal defaults')
  })

  it('seeds Params rows from {placeholders} in the full URL', () => {
    mountDraft(mkDraft({ url: 'https://api.example.com/v1/invoices/{id}' }))
    expect(document.body.textContent).toContain('path.id')
  })

  it('adding in a section writes an auto-prefixed default onto the draft', () => {
    const draft = mkDraft()
    mountDraft(draft)
    const tab = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) =>
      b.textContent?.includes('Body'),
    )!
    tab.click()
    flushSync()
    const input = document.querySelector<HTMLInputElement>('input[placeholder*="nests"]')!
    input.value = 'user.name'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    flushSync()
    expect(draft.defaults?.map((d) => d.key)).toContain('body.user.name')
    expect(app.nodes).toHaveLength(0) // nothing touched the board
  })
})
