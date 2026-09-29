// Transform node execution on the frontend (plan 06): Pick mode runs on the
// mirrored resolver in refs.ts; Script mode is executed by the Go sandbox
// through the api layer. Used by both the run simulation and the inspector's
// "Test against last response" button.
import { readableAncestors } from './ancestry'
import { api } from './api'
import type {
  AppEdge,
  AppNode,
  CapturedResponse,
  NodeField,
  ScriptUpstream,
  TransformNode,
  TransformNodeData,
} from './model'
import { directUpstreams, keyByNodeId, resolveField, type ResolveContext } from './refs'

/** Seed script for new transform nodes — documents the sandbox's inputs. */
export const DEFAULT_TRANSFORM_SCRIPT = `// Inputs: res (single upstream), nodes.<key> (all ancestors), i (iteration),
// item (each-mode loops). _ has pick/omit/groupBy/uniq/chunk/sum… — return a JSON-serializable value.
return res.body
`

/**
 * Node-data patch for an edit to what a transform computes, stamped with the
 * edit time so the card can spot a result shape left over from earlier code
 * (nodeIO `isResultStale`). Every write to `mode` or `script` goes through it.
 */
export function transformEdit(
  patch: Pick<Partial<TransformNodeData>, 'mode' | 'script'>,
  at = new Date(),
): Partial<TransformNodeData> {
  return { ...patch, transformEditedAt: at.toISOString() }
}

/** Loop-scope inputs a transform executes under (top level: index 0, no item). */
export interface TransformScope {
  index: number
  item?: unknown
  hasItem?: boolean
}

/** Runs the declarative Pick rows against resolved upstream outputs. */
export function runPick(rows: NodeField[], ctx: ResolveContext): unknown {
  if (rows.length === 0) throw new Error('pick mode needs at least one row')
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const key = row.key.trim()
    if (key === '') throw new Error('pick row with empty output key')
    let value: unknown
    try {
      value = resolveField(row, ctx)
    } catch (err) {
      throw new Error(`pick "${key}": ${err instanceof Error ? err.message : String(err)}`)
    }
    setKeyPath(result, key, value)
  }
  return result
}

/**
 * Writes value at a dot path inside the result, creating intermediate
 * objects ("user.id" → {user: {id}}). Later rows win over non-object
 * intermediates, mirroring core/transform.setKeyPath.
 */
export function setKeyPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segs = path.split('.')
  let current = target
  for (const seg of segs.slice(0, -1)) {
    const next = current[seg]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      current[seg] = {}
    }
    current = current[seg] as Record<string, unknown>
  }
  current[segs[segs.length - 1]] = value
}

/**
 * Executes one transform node against captured responses. Pick resolves
 * locally (same resolver the sim uses for http fields); Script runs in the
 * Go goja sandbox. Throws with a user-facing message on any failure.
 */
export async function executeTransform(
  node: TransformNode,
  nodes: readonly AppNode[],
  edges: readonly AppEdge[],
  responses: Readonly<Record<string, CapturedResponse | undefined>>,
  exports: ResolveContext['exports'],
  scope: TransformScope = { index: 0 },
): Promise<unknown> {
  const upstreams = directUpstreams(edges, node.id)
  if (node.data.mode === 'pick') {
    return runPick(node.data.pick, {
      outputs: responses,
      exports,
      upstreams,
      index: scope.index,
      item: scope.item,
      hasItem: scope.hasItem,
    })
  }
  const keys = keyByNodeId(nodes)
  const ancestors = readableAncestors(nodes, edges, node.id)
  const byKey: Record<string, ScriptUpstream> = {}
  for (const n of nodes) {
    if (n.id === node.id || !ancestors.has(n.id)) continue
    const captured = responses[n.id]
    // A capture with no body is one the board persisted schema-only (response
    // capture off). There is nothing for a script to read, so the upstream is
    // absent rather than present-with-undefined.
    if (!captured || captured.body === undefined) continue
    byKey[keys.get(n.id) ?? n.id] = toUpstream(captured)
  }
  const single = upstreams.length === 1 ? responses[upstreams[0]] : undefined
  const res = single?.body === undefined ? undefined : single
  return api.runTransformScript({
    script: node.data.script,
    nodes: byKey,
    ...(res ? { res: toUpstream(res) } : {}),
    index: scope.index,
    ...(scope.hasItem ? { item: scope.item, hasItem: true } : {}),
  })
}

function toUpstream(captured: CapturedResponse): ScriptUpstream {
  return { status: captured.status, headers: captured.headers, body: captured.body }
}
