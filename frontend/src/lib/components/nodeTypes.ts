// xyflow node registry, keyed by NodeType (plan 06 T1). The transform and
// note cards land with T5/T6; until then only http is registered, and
// GraphCanvas refuses to render nodes whose type is not in this map
// (assertKnownNodeTypes) so an unknown type fails loudly instead of falling
// back to xyflow's default node.
import type { NodeTypes } from '@xyflow/svelte'
import type { NodeType } from '../model'
import OperationNode from './OperationNode.svelte'

export const nodeTypes = {
  http: OperationNode,
} satisfies NodeTypes & Partial<Record<NodeType, unknown>>

export const registeredNodeTypes: ReadonlySet<string> = new Set(Object.keys(nodeTypes))
