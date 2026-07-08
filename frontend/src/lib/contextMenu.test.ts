import { describe, expect, it } from 'vitest'
import { libraryMenuItems, menuItems } from './contextMenu'

describe('context menu contents (plan 03 §2)', () => {
  it('pane menu offers add-node, custom request, add-transform, add-note, paste (disabled until plan 07) and fit view', () => {
    const items = menuItems('pane', { isRunning: false })
    expect(items.map((i) => i.label)).toEqual([
      'Add node…',
      'Add custom request',
      'Add transform',
      'Add note',
      'Paste',
      'Fit view',
    ])
    expect(items.find((i) => i.action === 'paste')?.disabled).toBe(true)
  })

  it('note node menu is annotation-only: duplicate and delete (plan 06 T6)', () => {
    const items = menuItems('node', { isRunning: false, nodeType: 'note' })
    expect(items.map((i) => i.action)).toEqual(['duplicate', 'delete-node'])
  })

  it('transform node menu skips schema pinning (http-only concern)', () => {
    const items = menuItems('node', { isRunning: false, nodeType: 'transform' })
    expect(items.some((i) => i.action === 'use-as-schema')).toBe(false)
    expect(items.some((i) => i.action === 'run-node')).toBe(true)
  })

  it('node menu offers run, clipboard, duplicate, rename, schema pin and delete', () => {
    const items = menuItems('node', { isRunning: false })
    expect(items.map((i) => i.label)).toEqual([
      'Run this node',
      'Run chain',
      'Copy',
      'Duplicate',
      'Rename',
      'Use last response as schema',
      'Delete',
    ])
    expect(items.find((i) => i.action === 'copy')?.disabled).toBe(true)
    expect(items.find((i) => i.action === 'run-node')?.disabled).toBe(false)
  })

  it('schema pin is disabled until the node has a captured response (plan 05 §8)', () => {
    const without = menuItems('node', { isRunning: false })
    expect(without.find((i) => i.action === 'use-as-schema')?.disabled).toBe(true)
    const withResponse = menuItems('node', { isRunning: false, hasResponse: true })
    expect(withResponse.find((i) => i.action === 'use-as-schema')?.disabled).toBe(false)
  })

  it('http node menu offers the library flows (plan 08 B3)', () => {
    const unlinked = menuItems('node', { isRunning: false, nodeType: 'http', library: 'none' })
    expect(unlinked.some((i) => i.action === 'save-to-collection')).toBe(true)
    // The update entry hides entirely without a resolvable requestRef.
    expect(unlinked.some((i) => i.action === 'update-collection-request')).toBe(false)

    const clean = menuItems('node', { isRunning: false, nodeType: 'http', library: 'clean' })
    expect(clean.find((i) => i.action === 'update-collection-request')?.disabled).toBe(true)

    const diverged = menuItems('node', { isRunning: false, nodeType: 'http', library: 'diverged' })
    expect(diverged.find((i) => i.action === 'update-collection-request')?.disabled).toBe(false)

    const transform = menuItems('node', { isRunning: false, nodeType: 'transform' })
    expect(transform.some((i) => i.action === 'save-to-collection')).toBe(false)
  })

  it('disables run entries while a run is in flight', () => {
    const items = menuItems('node', { isRunning: true })
    expect(items.find((i) => i.action === 'run-node')?.disabled).toBe(true)
    expect(items.find((i) => i.action === 'run-chain')?.disabled).toBe(true)
  })

  it('edge menu has the single "Cut connection" entry', () => {
    const items = menuItems('edge', { isRunning: false })
    expect(items.map((i) => i.label)).toEqual(['Cut connection'])
  })
})

describe('collections tree menus (plan 08 B2)', () => {
  it('collection and folder menus offer new request/folder, rename and delete', () => {
    for (const kind of ['collection', 'folder'] as const) {
      const items = libraryMenuItems(kind)
      expect(items.map((i) => i.action)).toEqual([
        'new-request',
        'new-folder',
        'rename-item',
        'delete-item',
      ])
    }
  })

  it('request menu offers edit, rename, duplicate and delete', () => {
    expect(libraryMenuItems('request').map((i) => i.action)).toEqual([
      'edit-request',
      'rename-item',
      'duplicate-request',
      'delete-item',
    ])
  })

  it('new request is live now that the editor dialog exists (plan 08 C7)', () => {
    expect(libraryMenuItems('collection').find((i) => i.action === 'new-request')?.disabled).toBeUndefined()
  })

  it('new folder is disabled at the depth cap', () => {
    expect(libraryMenuItems('folder').find((i) => i.action === 'new-folder')?.disabled).toBe(false)
    expect(
      libraryMenuItems('folder', { atDepthCap: true }).find((i) => i.action === 'new-folder')?.disabled,
    ).toBe(true)
  })

  it('delete carries the board-reference warning in its label', () => {
    expect(libraryMenuItems('request').find((i) => i.action === 'delete-item')?.label).toBe('Delete')
    expect(
      libraryMenuItems('request', { refCount: 1 }).find((i) => i.action === 'delete-item')?.label,
    ).toBe('Delete (1 node references it)')
    expect(
      libraryMenuItems('collection', { refCount: 3 }).find((i) => i.action === 'delete-item')?.label,
    ).toBe('Delete (3 nodes reference it)')
  })
})
