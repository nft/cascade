import { describe, expect, it } from 'vitest'
import { menuItems } from './contextMenu'

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
