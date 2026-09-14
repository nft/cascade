// Everything that edits one node — delete, re-parent, rename, retarget, and
// the field editors — kept out of state.svelte.ts, which owns the state
// itself. Adding a node is a one-liner over nodeFactory and stays there;
// these carry rules (cascade, containment, refusals, validation) worth
// reading on their own.
import { absoluteCenter, containerAt, parentsFirst, positionForParent } from './containment'
import { dialogs } from './dialogs.svelte'
import { isHttpNode, type AppNode, type NodeField } from './model'
import { isValidKey, takenKeys } from './refs'
import { normalizeOrigin } from './request'
import { capturedSchema } from './schema'
import type { AppState } from './state.svelte'

export function removeNode(app: AppState, id: string) {
  // A For container takes its children with it (plan 09 N5) — a dangling
  // parentId would break xyflow; drag-out first is the rescue path.
  const doomed = new Set([id, ...app.nodes.filter((n) => n.parentId === id).map((n) => n.id)])
  app.nodes = app.nodes.filter((n) => !doomed.has(n.id))
  app.edges = app.edges.filter((e) => !doomed.has(e.source) && !doomed.has(e.target))
  if ([...doomed].some((d) => d in app.responses)) {
    app.responses = Object.fromEntries(
      Object.entries(app.responses).filter(([nodeId]) => !doomed.has(nodeId)),
    )
  }
  if (app.selectedNodeId && doomed.has(app.selectedNodeId)) app.selectedNodeId = null
  app.scheduleBoardSave()
}

/**
 * Delete with the For safeguard: a container that still holds children asks
 * for confirmation (the dialog calls removeNode on confirm); anything else
 * deletes immediately.
 */
export function removeNodeRequest(app: AppState, id: string) {
  const node = app.nodes.find((n) => n.id === id)
  if (!node) return
  const childCount = app.nodes.filter((n) => n.parentId === id).length
  if (node.type === 'for' && childCount > 0) {
    dialogs.confirmDeleteFor = { nodeId: id, childCount }
    return
  }
  removeNode(app, id)
}

/**
 * Loop membership on drop (plan 09 N5): re-parent the dropped node into the
 * For container under its center, or back to top level, translating the
 * position so it stays visually put. Refusals (nested For, edges that would
 * cross the loop boundary) toast and change nothing.
 */
export function dropNode(app: AppState, id: string) {
  const node = app.nodes.find((n) => n.id === id)
  if (!node || node.type === 'note') return // annotations stay top-level
  const target = containerAt(app.nodes, absoluteCenter(node, app.nodes), id)
  const targetId = target?.id ?? null
  if ((node.parentId ?? null) === targetId) return
  if (target && node.type === 'for') {
    dialogs.showToast('Nested for loops are not supported')
    return
  }
  const crossing = app.edges.some((e) => {
    if (e.source !== id && e.target !== id) return false
    const otherId = e.source === id ? e.target : e.source
    const other = app.nodes.find((n) => n.id === otherId)
    return (other?.parentId ?? null) !== targetId
  })
  if (crossing) {
    dialogs.showToast(
      target
        ? `An edge would cross the loop boundary — cut it before moving "${node.data.name}" in`
        : `An edge to a loop sibling would cross the boundary — cut it before moving "${node.data.name}" out`,
    )
    return
  }
  const position = positionForParent(node, app.nodes, target)
  app.nodes = parentsFirst(
    app.nodes.map((n) => {
      if (n.id !== id) return n
      const { parentId: _dropped, ...rest } = n
      return (target ? { ...rest, parentId: target.id, position } : { ...rest, position }) as AppNode
    }),
  )
  app.scheduleBoardSave()
}

/**
 * Rename a node's reference key. Returns an error message when the key is
 * rejected (bad slug, reserved word, or taken on this board); null on
 * success. Refs store node IDs, so no field on any node is rewritten.
 */
export function setNodeKey(app: AppState, id: string, key: string): string | null {
  if (!isValidKey(key)) return 'keys are letters, digits and _, starting with a letter ("res" and "i" are reserved)'
  if (takenKeys(app.nodes, id).has(key)) return `key "${key}" is already used on this board`
  app.updateNodeData(id, { key })
  return null
}

/**
 * Set or clear a node's origin override (plan 08 A1). Returns an error
 * message when the value is not an absolute http(s) URL; null on success.
 * An empty value clears the override back to the environment's base URL.
 */
export function setNodeOrigin(app: AppState, id: string, raw: string): string | null {
  if (raw.trim() === '') {
    app.updateNodeData(id, { origin: undefined })
    return null
  }
  const origin = normalizeOrigin(raw)
  if (!origin) return 'origin must be an absolute http(s) URL, e.g. https://api.example.com'
  app.updateNodeData(id, { origin })
  return null
}

/** Replace one request field's parsed value (from the inspector editor). */
export function setField(app: AppState, nodeId: string, field: NodeField) {
  const node = app.nodes.find((n) => n.id === nodeId)
  if (!node || !isHttpNode(node)) return
  const fields = node.data.fields.some((f) => f.key === field.key)
    ? node.data.fields.map((f) => (f.key === field.key ? field : f))
    : [...node.data.fields, field]
  app.updateNodeData(nodeId, { fields })
}

/**
 * Rename a field in place, keeping its row position — composing
 * removeField+setField would append the renamed key at the bottom of its
 * section (setField appends unknown keys), which reads as a bug (plan 10 §3b).
 */
export function renameField(app: AppState, nodeId: string, oldKey: string, newKey: string) {
  const node = app.nodes.find((n) => n.id === nodeId)
  if (!node || !isHttpNode(node)) return
  if (node.data.fields.some((f) => f.key === newKey)) return
  app.updateNodeData(nodeId, {
    fields: node.data.fields.map((f) => (f.key === oldKey ? { ...f, key: newKey } : f)),
  })
}

export function removeField(app: AppState, nodeId: string, fieldKey: string) {
  const node = app.nodes.find((n) => n.id === nodeId)
  if (!node || !isHttpNode(node)) return
  app.updateNodeData(nodeId, { fields: node.data.fields.filter((f) => f.key !== fieldKey) })
}

/**
 * Pin the schema inferred from the node's last captured response onto the
 * node (plan 05 §8). Pinned schemas serialize with the board, so shared
 * boards keep working pickers without run history; invoking again after a
 * newer run re-infers.
 */
export function useLastResponseAsSchema(app: AppState, nodeId: string) {
  const captured = app.responses[nodeId]
  if (!captured) return
  const schema = capturedSchema(captured)
  if (schema) app.updateNodeData(nodeId, { responseSchema: schema })
}
