// Pure logic behind the binding picker (plan 05 V4), kept out of the Svelte
// components so it stays unit-testable.
import { upstreamIds } from './graph'
import { isHttpNode, type AppEdge, type AppNode, type CapturedResponse, type HttpNode, type SchemaJSON } from './model'

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
  node: HttpNode,
  captured: CapturedResponse | undefined,
  inferFromBody: (body: unknown) => SchemaJSON,
): NodeSchemaSource | null {
  if (node.data.responseSchema) {
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
 * The http nodes a field on `targetId` may reference: its transitive
 * ancestors, in board declaration order, the direct upstream flagged (it is
 * also reachable as `res` when it is the only one).
 */
export function ancestorNodes(
  nodes: readonly AppNode[],
  edges: readonly AppEdge[],
  targetId: string,
): { node: HttpNode; direct: boolean }[] {
  const reachable = upstreamIds(edges as AppEdge[], targetId)
  const direct = new Set(edges.filter((e) => e.target === targetId).map((e) => e.source))
  return nodes
    .filter((n) => n.id !== targetId && reachable.has(n.id))
    .filter(isHttpNode)
    .map((node) => ({ node, direct: direct.has(node.id) }))
}
