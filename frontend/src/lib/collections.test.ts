import { describe, expect, it } from 'vitest'
import {
  addFolder,
  addRequest,
  findRequest,
  flattenRequests,
  folderById,
  folderDepth,
  folderOptions,
  makeCollection,
  makeFolder,
  removeFolder,
  removeRequest,
  requestMatches,
  requestRefCount,
  updateFolder,
  updateRequest,
} from './collections'
import type { BoardNodeJSON, CollectionFolder, RequestDef } from './model'

const req = (id: string, name = id): RequestDef => ({
  id,
  name,
  protocol: 'http',
  method: 'POST',
  url: `/v1/${id}`,
})

/** root ── a ── b, with requests at root (r0), in a (r1) and in b (r2). */
const tree = (): CollectionFolder => ({
  id: 'root',
  name: '',
  requests: [req('r0', 'Ping')],
  folders: [
    {
      id: 'a',
      name: 'Billing',
      requests: [req('r1', 'Create invoice')],
      folders: [{ id: 'b', name: 'Refunds', requests: [req('r2', 'Refund')] }],
    },
  ],
})

describe('collection tree lookups (plan 08 B1)', () => {
  it('folderById finds nested folders, including the root', () => {
    expect(folderById(tree(), 'root')?.id).toBe('root')
    expect(folderById(tree(), 'b')?.name).toBe('Refunds')
    expect(folderById(tree(), 'nope')).toBeNull()
  })

  it('folderDepth counts levels below the root', () => {
    expect(folderDepth(tree(), 'root')).toBe(0)
    expect(folderDepth(tree(), 'a')).toBe(1)
    expect(folderDepth(tree(), 'b')).toBe(2)
    expect(folderDepth(tree(), 'nope')).toBeNull()
  })

  it('folderOptions lists root first, then folders with breadcrumb labels', () => {
    expect(folderOptions(tree())).toEqual([
      { id: 'root', label: '/' },
      { id: 'a', label: 'Billing' },
      { id: 'b', label: 'Billing / Refunds' },
    ])
  })

  it('findRequest searches all folders; flattenRequests keeps the folder trail', () => {
    expect(findRequest(tree(), 'r2')?.name).toBe('Refund')
    expect(findRequest(tree(), 'nope')).toBeNull()
    expect(flattenRequests(tree()).map(({ request, trail }) => `${trail.join('/')}:${request.id}`)).toEqual([
      ':r0',
      'Billing:r1',
      'Billing/Refunds:r2',
    ])
  })
})

describe('collection tree mutations are immutable', () => {
  it('updateFolder rebuilds only the path to the target', () => {
    const root = tree()
    const next = updateFolder(root, 'b', (f) => ({ ...f, name: 'Chargebacks' }))!
    expect(folderById(next, 'b')?.name).toBe('Chargebacks')
    expect(folderById(root, 'b')?.name).toBe('Refunds') // original untouched
    expect(updateFolder(root, 'nope', (f) => f)).toBeNull()
  })

  it('addFolder enforces the depth cap of 3', () => {
    const withC = addFolder(tree(), 'b', makeFolder('depth3'))
    expect(withC).not.toBeNull()
    const c = folderById(withC!, 'b')!.folders![0]
    expect(addFolder(withC!, c.id, makeFolder('depth4'))).toBeNull()
    expect(addFolder(tree(), 'nope', makeFolder('x'))).toBeNull()
  })

  it('removeFolder drops the folder and everything inside it', () => {
    const next = removeFolder(tree(), 'a')!
    expect(folderById(next, 'a')).toBeNull()
    expect(findRequest(next, 'r2')).toBeNull()
    expect(removeFolder(tree(), 'nope')).toBeNull()
  })

  it('add/update/removeRequest work at any depth', () => {
    const added = addRequest(tree(), 'b', req('r3'))!
    expect(findRequest(added, 'r3')).not.toBeNull()

    const renamed = updateRequest(added, 'r2', (r) => ({ ...r, name: 'Refund v2' }))!
    expect(findRequest(renamed, 'r2')?.name).toBe('Refund v2')

    const removed = removeRequest(renamed, 'r1')!
    expect(findRequest(removed, 'r1')).toBeNull()
    expect(removeRequest(removed, 'r1')).toBeNull()
  })

  it('makeCollection starts with an empty root', () => {
    const c = makeCollection('Payments')
    expect(c.name).toBe('Payments')
    expect(c.root.requests).toEqual([])
  })
})

describe('requestMatches / requestRefCount (plan 08 B2)', () => {
  it('matches method, url and name case-insensitively; ws falls back to protocol', () => {
    expect(requestMatches(req('r1', 'Create invoice'), 'INVOICE')).toBe(true)
    expect(requestMatches(req('r1'), '/v1/r1')).toBe(true)
    expect(requestMatches(req('r1'), 'delete')).toBe(false)
    expect(requestMatches({ id: 'w', name: 'Events', protocol: 'ws', url: '/events' }, 'ws')).toBe(true)
  })

  it('counts nodes whose requestRef points into the collection', () => {
    const nodes: Pick<BoardNodeJSON, 'data'>[] = [
      { data: { requestRef: { collectionId: 'col1', requestId: 'r1' } } },
      { data: { requestRef: { collectionId: 'col1', requestId: 'r2' } } },
      { data: { requestRef: { collectionId: 'other', requestId: 'r1' } } },
      { data: {} },
      {},
    ]
    expect(requestRefCount(nodes, 'col1')).toBe(2)
    expect(requestRefCount(nodes, 'col1', 'r1')).toBe(1)
    expect(requestRefCount(nodes, 'col1', 'r9')).toBe(0)
  })
})
