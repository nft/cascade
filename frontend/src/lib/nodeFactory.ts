// Fresh-node payloads for canvas insertion, kept out of the store so
// AppState only orchestrates (id allocation, selection, persistence).
import type { AppNode, Operation, ProjectDefaults } from './model'
import { slugifyKey, takenKeys, uniqueKey } from './refs'
import { DEFAULT_TRANSFORM_SCRIPT } from './transform'

export function makeHttpNode(
  op: Operation,
  id: string,
  existing: readonly AppNode[],
  defaults: ProjectDefaults | undefined,
  position: { x: number; y: number },
): AppNode {
  return {
    id,
    type: 'http',
    position,
    data: {
      name: op.summary,
      key: uniqueKey(slugifyKey(op.summary), takenKeys(existing)),
      method: op.method,
      path: op.path,
      environment: defaults?.environment ?? '',
      credential: defaults?.credential ?? '',
      status: 'idle',
      repeat: 1,
      fields: [],
    },
  }
}

/** A transform node (plan 06): Pick mode by default, no target/env — it only reshapes. */
export function makeTransformNode(
  id: string,
  existing: readonly AppNode[],
  position: { x: number; y: number },
): AppNode {
  return {
    id,
    type: 'transform',
    position,
    data: {
      name: 'Transform',
      key: uniqueKey('transform', takenKeys(existing)),
      status: 'idle',
      mode: 'pick',
      pick: [],
      script: DEFAULT_TRANSFORM_SCRIPT,
    },
  }
}

/** A note sticky (plan 06 T6) — an annotation, never part of runs. */
export function makeNoteNode(id: string, position: { x: number; y: number }): AppNode {
  return { id, type: 'note', position, data: { text: '' } }
}
