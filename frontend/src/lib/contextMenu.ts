// Context menu contents per kind (plan 03 §2), data-driven so tests can assert entries.
import type { LibraryLinkState } from './library'
import type { NodeType } from './model'

export type ContextMenuKind = 'pane' | 'node' | 'edge'

export type MenuAction =
  | 'add-node'
  | 'add-custom-request'
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
  | 'save-to-collection'
  | 'update-collection-request'
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
const LIBRARY_CLEAN_TITLE = 'The node matches its library request'

export function menuItems(
  kind: ContextMenuKind,
  opts: {
    isRunning: boolean
    hasResponse?: boolean
    nodeType?: NodeType
    /** Library link of an http node; drives the collection entries (plan 08 B3). */
    library?: LibraryLinkState
  },
): MenuItem[] {
  switch (kind) {
    case 'pane':
      return [
        { action: 'add-node', icon: 'add_circle', label: 'Add node…' },
        { action: 'add-custom-request', icon: 'http', label: 'Add custom request' },
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
        // Library flows (plan 08 B3) are http-only; the update entry hides
        // entirely on a dangling/absent requestRef (provenance only).
        ...(opts.nodeType === 'http'
          ? [
              { action: 'save-to-collection' as const, icon: 'library_add', label: 'Save to collection…' },
              ...(opts.library === 'clean' || opts.library === 'diverged'
                ? [
                    {
                      action: 'update-collection-request' as const,
                      icon: 'upload',
                      label: 'Update collection request',
                      disabled: opts.library === 'clean',
                      title: opts.library === 'clean' ? LIBRARY_CLEAN_TITLE : undefined,
                    },
                  ]
                : []),
            ]
          : []),
        { action: 'delete-node', icon: 'delete', label: 'Delete', danger: true },
      ]
    case 'edge':
      return [{ action: 'cut-edge', icon: 'content_cut', label: 'Cut connection', danger: true }]
  }
}

// --- collections tree menus (plan 08 B2) -------------------------------------

/** Row kinds in the sidebar collections tree. The root folder uses 'collection'. */
export type LibraryMenuKind = 'collection' | 'folder' | 'request'

export type LibraryMenuAction =
  | 'new-request'
  | 'new-folder'
  | 'edit-request'
  | 'rename-item'
  | 'duplicate-request'
  | 'delete-item'

export interface LibraryMenuItem {
  action: LibraryMenuAction
  icon: string
  label: string
  disabled?: boolean
  danger?: boolean
  title?: string
}

const DEPTH_CAP_TITLE = 'Folders nest at most 3 levels deep'

/**
 * Context menu for one collections-tree row. `refCount` is how many board
 * nodes reference the item (or anything inside it) — deletion stays allowed
 * (a requestRef is provenance only) but the label carries the warning.
 */
export function libraryMenuItems(
  kind: LibraryMenuKind,
  opts: { atDepthCap?: boolean; refCount?: number } = {},
): LibraryMenuItem[] {
  const refCount = opts.refCount ?? 0
  const deleteLabel =
    refCount > 0
      ? `Delete (${refCount} ${refCount === 1 ? 'node references' : 'nodes reference'} it)`
      : 'Delete'
  const items: LibraryMenuItem[] = [
    ...(kind === 'request'
      ? [{ action: 'edit-request' as const, icon: 'edit_note', label: 'Edit request…' }]
      : [
          { action: 'new-request' as const, icon: 'http', label: 'New request…' },
          {
            action: 'new-folder' as const,
            icon: 'create_new_folder',
            label: 'New folder',
            disabled: opts.atDepthCap ?? false,
            title: opts.atDepthCap ? DEPTH_CAP_TITLE : undefined,
          },
        ]),
    { action: 'rename-item', icon: 'edit', label: 'Rename' },
    ...(kind === 'request'
      ? [{ action: 'duplicate-request' as const, icon: 'control_point_duplicate', label: 'Duplicate' }]
      : []),
    { action: 'delete-item', icon: 'delete', label: deleteLabel, danger: true },
  ]
  return items
}
