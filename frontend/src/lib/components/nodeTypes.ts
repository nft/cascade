// xyflow node registry, keyed by NodeType. GraphCanvas refuses
// to render nodes whose type is not in this map (assertKnownNodeTypes) so an
// unknown type fails loudly instead of falling back to xyflow's default node.
import type { NodeTypes } from '@xyflow/svelte'
import type { NodeType } from '../model'
import DelayNode from './DelayNode.svelte'
import ForNode from './ForNode.svelte'
import MockNode from './MockNode.svelte'
import NoteNode from './NoteNode.svelte'
import OperationNode from './OperationNode.svelte'
import TransformNode from './TransformNode.svelte'

export const nodeTypes = {
  http: OperationNode,
  transform: TransformNode,
  note: NoteNode,
  mock: MockNode,
  delay: DelayNode,
  for: ForNode,
} satisfies NodeTypes & Record<NodeType, unknown>

export const registeredNodeTypes: ReadonlySet<string> = new Set(Object.keys(nodeTypes))
