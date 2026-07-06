// Context menu contents per kind (plan 03 §2), data-driven so tests can assert entries.
import type { NodeType } from './model'

export type ContextMenuKind = 'pane' | 'node' | 'edge'

export type MenuAction =
  | 'add-node'
  | 'add-transform'
  | 'add-note'
  | 'paste'
  | 'fit-view'
  | 'run-node'
  | 'run-chain'
  | 'copy'
  | 'duplicate'
  | 'rename'
  | 'use-as-schema'
  | 'delete-node'
  | 'cut-edge'

export interface MenuItem {
  action: MenuAction
  icon: string
  label: string
  disabled?: boolean
  danger?: boolean
  title?: string
}

const CLIPBOARD_TITLE = 'Clipboard lands with board export / import (plan 07)'
const NO_RESPONSE_TITLE = 'Run the node first — inference needs a captured response'

export function menuItems(
  kind: ContextMenuKind,
  opts: { isRunning: boolean; hasResponse?: boolean; nodeType?: NodeType },
): MenuItem[] {
  switch (kind) {
    case 'pane':
      return [
        { action: 'add-node', icon: 'add_circle', label: 'Add node…' },
        { action: 'add-transform', icon: 'function', label: 'Add transform' },
        { action: 'add-note', icon: 'sticky_note_2', label: 'Add note' },
        { action: 'paste', icon: 'content_paste', label: 'Paste', disabled: true, title: CLIPBOARD_TITLE },
        { action: 'fit-view', icon: 'fit_screen', label: 'Fit view' },
      ]
    case 'node':
      // Notes are annotations: nothing to run, rename (no inspector) or pin.
      if (opts.nodeType === 'note') {
        return [
          { action: 'duplicate', icon: 'control_point_duplicate', label: 'Duplicate' },
          { action: 'delete-node', icon: 'delete', label: 'Delete', danger: true },
        ]
      }
      return [
        { action: 'run-node', icon: 'play_arrow', label: 'Run this node', disabled: opts.isRunning },
        { action: 'run-chain', icon: 'play_circle', label: 'Run chain', disabled: opts.isRunning },
        { action: 'copy', icon: 'content_copy', label: 'Copy', disabled: true, title: CLIPBOARD_TITLE },
        { action: 'duplicate', icon: 'control_point_duplicate', label: 'Duplicate' },
        { action: 'rename', icon: 'edit', label: 'Rename' },
        // Schema pinning is an http concern: transforms carry no OpenAPI
        // response schema, their picker tree infers from the last output.
        ...(opts.nodeType === 'transform'
          ? []
          : [
              {
                action: 'use-as-schema' as const,
                icon: 'schema',
                label: 'Use last response as schema',
                disabled: !opts.hasResponse,
                title: opts.hasResponse ? undefined : NO_RESPONSE_TITLE,
              },
            ]),
        { action: 'delete-node', icon: 'delete', label: 'Delete', danger: true },
      ]
    case 'edge':
      return [{ action: 'cut-edge', icon: 'content_cut', label: 'Cut connection', danger: true }]
  }
}
