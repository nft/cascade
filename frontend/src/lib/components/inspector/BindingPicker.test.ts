import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppNode, HttpNode } from '../../model'
import { app } from '../../state.svelte'
import Inspector from '../Inspector.svelte'

const httpNode = (id: string, name: string, key: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name,
    key,
    method: 'POST',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status: 'idle',
    fields: [{ key: 'body.owner_id', source: 'literal', value: '' }],
  },
})

let instance: ReturnType<typeof mount> | null = null

beforeEach(() => {
  document.body.innerHTML = ''
  app.nodes = [httpNode('create-user', 'Create User', 'createUser'), httpNode('create-org', 'Create Org', 'createOrg')]
  app.edges = [{ id: 'e1', source: 'create-user', target: 'create-org' }]
  // No spec response schema exists — only a captured response to infer from.
  app.responses = {
    'create-user': {
      status: 201,
      body: { id: '3f2a8c1e-1b2d-4e5f-8a9b-0c1d2e3f4a5b', name: 'Ada', nested: { deep: 1 } },
      at: '2026-07-06T14:02:00Z',
    },
  }
  app.selectedNodeId = 'create-org'
  instance = mount(Inspector, { target: document.body })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
  app.responses = {}
})

function openPicker() {
  const toggle = document.querySelector(
    'button[aria-label="Insert reference into body.owner_id"]',
  ) as HTMLButtonElement
  expect(toggle).not.toBeNull()
  toggle.click()
  flushSync()
}

describe('binding picker', () => {
  it('shows the ancestor with an inferred tree when the spec has no response schema', () => {
    openPicker()
    const picker = document.querySelector('[data-testid="binding-picker"]')!
    expect(picker).not.toBeNull()
    expect(picker.textContent).toContain('createUser')
    // 14:02Z read on the pinned test clock (Asia/Tokyo) — the capture time is
    // UTC on the wire and shown in the viewer's zone, beside a run log the Go
    // side already writes in local time.
    expect(picker.textContent).toContain('inferred from last run · 23:02')
    // inferred body keys appear as pickable rows
    expect(picker.textContent).toContain('name')
    expect(picker.textContent).toContain('nested')
  })

  it('clicking a tree row inserts {{createUser.path}} into the field', () => {
    openPicker()
    const row = [...document.querySelectorAll('[data-testid="binding-picker"] button')].find((el) =>
      el.getAttribute('title')?.includes('Insert body.id'),
    ) as HTMLButtonElement
    expect(row).not.toBeNull()
    row.click()
    flushSync()
    const org = app.nodes.find((n) => n.id === 'create-org') as HttpNode
    const field = org.data.fields.find((f) => f.key === 'body.owner_id')!
    // whole-field single reference → structured binding storing the node ID
    expect(field.source).toBe('binding')
    expect(field.ref).toEqual({ nodeId: 'create-user', path: 'body.id' })
  })

  it('lists exports first and inserts them as {{createUser.userId}}', () => {
    app.setExports('create-user', [{ key: 'userId', path: 'body.id' }])
    flushSync()
    openPicker()
    const chip = [...document.querySelectorAll('[data-testid="binding-picker"] button')].find(
      (el) => el.getAttribute('title') === 'Export: body.id',
    ) as HTMLButtonElement
    expect(chip).not.toBeNull()
    chip.click()
    flushSync()
    const org = app.nodes.find((n) => n.id === 'create-org') as HttpNode
    const field = org.data.fields.find((f) => f.key === 'body.owner_id')!
    expect(field.source).toBe('binding')
    expect(field.ref).toEqual({ nodeId: 'create-user', path: 'userId' })
  })

  it('falls back to a free-text path input when there is no schema at all', () => {
    app.responses = {}
    flushSync()
    openPicker()
    const free = document.querySelector(
      '[data-testid="binding-picker"] input[placeholder^="body.path"]',
    ) as HTMLInputElement
    expect(free).not.toBeNull()
  })

  it('inserting into existing text yields an interpolating template', () => {
    const org = app.nodes.find((n) => n.id === 'create-org') as HttpNode
    app.setField('create-org', { key: 'body.owner_id', source: 'literal', value: 'welcome-' })
    flushSync()
    openPicker()
    // place the cursor at the end of the existing literal
    const input = [...document.querySelectorAll('input')].find((el) => el.value === 'welcome-')!
    expect(input).not.toBeUndefined()
    input.setSelectionRange(8, 8)
    const row = [...document.querySelectorAll('[data-testid="binding-picker"] button')].find((el) =>
      el.getAttribute('title')?.includes('Insert body.name'),
    ) as HTMLButtonElement
    row.click()
    flushSync()
    const field = (app.nodes.find((n) => n.id === 'create-org') as HttpNode).data.fields[0]
    expect(field.source).toBe('template')
    // stored template carries the node ID; the input renders the key form
    expect(field.value).toBe('welcome-{{create-user.body.name}}')
    void org
  })
})
