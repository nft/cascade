// Context menu contents per kind (plan 03 §2), data-driven so tests can assert entries.
export type ContextMenuKind = 'pane' | 'node' | 'edge'

export type MenuAction =
  | 'add-node'
  | 'paste'
  | 'fit-view'
  | 'run-node'
  | 'run-chain'
  | 'copy'
  | 'duplicate'
  | 'rename'
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

export function menuItems(kind: ContextMenuKind, opts: { isRunning: boolean }): MenuItem[] {
  switch (kind) {
    case 'pane':
      return [
        { action: 'add-node', icon: 'add_circle', label: 'Add node…' },
        { action: 'paste', icon: 'content_paste', label: 'Paste', disabled: true, title: CLIPBOARD_TITLE },
        { action: 'fit-view', icon: 'fit_screen', label: 'Fit view' },
      ]
    case 'node':
      return [
        { action: 'run-node', icon: 'play_arrow', label: 'Run this node', disabled: opts.isRunning },
        { action: 'run-chain', icon: 'play_circle', label: 'Run chain', disabled: opts.isRunning },
        { action: 'copy', icon: 'content_copy', label: 'Copy', disabled: true, title: CLIPBOARD_TITLE },
        { action: 'duplicate', icon: 'control_point_duplicate', label: 'Duplicate' },
        { action: 'rename', icon: 'edit', label: 'Rename' },
        { action: 'delete-node', icon: 'delete', label: 'Delete', danger: true },
      ]
    case 'edge':
      return [{ action: 'cut-edge', icon: 'content_cut', label: 'Cut connection', danger: true }]
  }
}
