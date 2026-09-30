// The editing surface the inspector's section components render over:
// an adapter instead of an HttpNode, so the request editor dialog can reuse
// RequestSection/FieldRow unchanged over a draft RequestDef.
import type { HttpMethod, HttpNode, NodeField, RawBody, RequestDef } from './model'
import { app } from './state.svelte'

export interface RequestEditorTarget {
  /** Stable identity for per-target UI state (remembered tab picks). */
  readonly id: string
  /**
   * Set when the target is a board node — enables bindings, templates and
   * ref validation. Absent for library drafts, which are literal-only
   * (bindings are board concepts and don't belong in a library).
   */
  readonly nodeId?: string
  readonly method: HttpMethod
  /** Whose {placeholders} seed Params rows; a draft's full URL works too. */
  readonly path: string
  readonly fields: readonly NodeField[]
  readonly rawBody?: RawBody
  setField(field: NodeField): void
  removeField(key: string): void
  /** Rewrite a field's key in place (row position preserved); collisions are the caller's job. */
  renameField(oldKey: string, newKey: string): void
  /** Absent when the target has no raw-body escape hatch. */
  setRawBody?(rawBody: RawBody | undefined): void
}

/** A canvas node as an editing target — all writes go through AppState. */
export function nodeTarget(node: HttpNode): RequestEditorTarget {
  return {
    id: node.id,
    nodeId: node.id,
    get method() {
      return node.data.method
    },
    get path() {
      return node.data.path
    },
    get fields() {
      return node.data.fields
    },
    get rawBody() {
      return node.data.rawBody
    },
    setField: (field) => app.setField(node.id, field),
    removeField: (key) => app.removeField(node.id, key),
    renameField: (oldKey, newKey) => app.renameField(node.id, oldKey, newKey),
    setRawBody: (rawBody) => app.updateNodeData(node.id, { rawBody }),
  }
}

/**
 * A dialog draft as an editing target. Mutates the draft in place — pass a
 * $state object so the section components stay reactive; nothing persists
 * until the dialog saves.
 */
export function draftTarget(draft: RequestDef): RequestEditorTarget {
  return {
    get id() {
      return draft.id
    },
    get method() {
      return draft.method ?? 'GET'
    },
    get path() {
      return draft.url
    },
    get fields() {
      return draft.defaults ?? []
    },
    get rawBody() {
      return draft.rawBody
    },
    setRawBody: (rawBody) => {
      draft.rawBody = rawBody
    },
    setField: (field) => {
      const defaults = draft.defaults ?? (draft.defaults = [])
      const at = defaults.findIndex((d) => d.key === field.key)
      if (at >= 0) defaults[at] = field
      else defaults.push(field)
    },
    removeField: (key) => {
      draft.defaults = (draft.defaults ?? []).filter((d) => d.key !== key)
    },
    renameField: (oldKey, newKey) => {
      draft.defaults = (draft.defaults ?? []).map((d) => (d.key === oldKey ? { ...d, key: newKey } : d))
    },
  }
}
