// Pure logic behind the binding picker (plan 05 V4), kept out of the Svelte
// components so it stays unit-testable.
import { upstreamIds } from './graph'
import {
  isHttpNode,
  isRunnableNode,
  type AppEdge,
  type AppNode,
  type CapturedResponse,
  type RunnableNode,
  type SchemaJSON,
} from './model'
import { schemaTree, type SchemaTreeNode } from './schema'

/** Where a node's picker tree comes from, in precedence order (plan 05 §8). */
export type SchemaOrigin = 'pinned' | 'spec' | 'inferred'

export interface NodeSchemaSource {
  schema: SchemaJSON
  origin: SchemaOrigin
  /** Human label for the tree header ("inferred from last run · 14:02"). */
  label: string
}

/**
 * Picker precedence per node: pinned schema ("use last response as schema")
 * → explicit OpenAPI response schema (none until M2 wires spec import) →
 * inferred from the last captured response. Null means the picker offers a
 * free-text path input instead of a tree.
 */
export function nodeSchemaSource(
  node: RunnableNode,
  captured: CapturedResponse | undefined,
  inferFromBody: (body: unknown) => SchemaJSON,
): NodeSchemaSource | null {
  // Pinned schemas exist on http nodes only; transforms always infer from
  // their last output.
  if (isHttpNode(node) && node.data.responseSchema) {
    return { schema: node.data.responseSchema, origin: 'pinned', label: 'pinned schema' }
  }
  if (captured && !captured.truncated) {
    return {
      schema: inferFromBody(captured.body),
      origin: 'inferred',
      label: `inferred from last run · ${captured.at.slice(11, 16)}`,
    }
  }
  return null
}

/**
 * The runnable nodes (http and transform) a field on `targetId` may
 * reference: its transitive ancestors, in board declaration order, the
 * direct upstream flagged (it is also reachable as `res` when it is the
 * only one).
 */
/** One offerable each-mode For source: an array-typed path in a node's schema (plan 09 N6). */
export interface ArrayPathOption {
  path: string
  /** The row's type label from the schema tree (usually `array`). */
  type: string
}

/**
 * Flattens a schema to the paths that resolve to arrays — the only paths an
 * each-mode For may iterate over. Paths through `[0]` stay offerable:
 * `body.groups[0].members` is a legitimate array too.
 */
export function arrayPaths(schema: SchemaJSON): ArrayPathOption[] {
  const out: ArrayPathOption[] = []
  const walk = (row: SchemaTreeNode) => {
    if (row.type.split(' | ').includes('array')) out.push({ path: row.path, type: row.type })
    row.children.forEach(walk)
  }
  walk(schemaTree(schema))
  return out
}

export function ancestorNodes(
  nodes: readonly AppNode[],
  edges: readonly AppEdge[],
  targetId: string,
): { node: RunnableNode; direct: boolean }[] {
  const reachable = upstreamIds(edges as AppEdge[], targetId)
  const direct = new Set(edges.filter((e) => e.target === targetId).map((e) => e.source))
  return nodes
    .filter((n) => n.id !== targetId && reachable.has(n.id))
    .filter(isRunnableNode)
    .map((node) => ({ node, direct: direct.has(node.id) }))
}
