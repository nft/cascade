import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AppNode } from '../model'
import { app } from '../state.svelte'
import Inspector from './Inspector.svelte'

const mkNode = (id: string): AppNode => ({
  id,
  type: 'http',
  position: { x: 0, y: 0 },
  data: {
    name: id,
    key: `key_${id.replace(/[^A-Za-z0-9]/g, '_')}`,
    method: 'GET',
    path: `/v1/${id}`,
    environment: 'staging',
    credential: 'staging-admin',
    status: 'idle',
    repeat: 1,
    fields: [],
  },
})

let instance: ReturnType<typeof mount> | null = null

beforeEach(() => {
  document.body.innerHTML = ''
  app.nodes = [mkNode('n1')]
  app.edges = []
  app.selectedNodeId = 'n1'
  instance = mount(Inspector, { target: document.body })
  flushSync()
})

afterEach(() => {
  if (instance) unmount(instance)
  instance = null
})

describe('Inspector close vs delete (plan 03 §1)', () => {
  it('✕ closes the panel and keeps the node', () => {
    const close = document.querySelector('button[title="Close inspector"]') as HTMLButtonElement
    expect(close).not.toBeNull()
    close.click()
    flushSync()
    expect(app.selectedNodeId).toBeNull()
    expect(app.nodes).toHaveLength(1)
    expect(document.querySelector('aside')).toBeNull()
  })

  it('the footer delete button removes the node', () => {
    const del = document.querySelector('button[title="Delete node"]') as HTMLButtonElement
    expect(del).not.toBeNull()
    del.click()
    flushSync()
    expect(app.nodes).toHaveLength(0)
    expect(app.selectedNodeId).toBeNull()
    expect(document.querySelector('aside')).toBeNull()
  })
})
