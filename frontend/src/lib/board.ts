// Conversions between canvas state (AppNode/AppEdge) and the on-disk board
// format (plan 01 P5). The wire format is the M1 graph JSON (id/type/name per
// node, from/to per edge) with node form data carried opaquely under `data`
// and canvas-only layout (positions, viewport) in a sibling `layout` key.
import {
  isNodeType,
  type AppEdge,
  type AppNode,
  type BoardJSON,
  type BoardNodeJSON,
  type BoardViewport,
  type HttpMethod,
  type NodeField,
  type OperationNodeData,
} from './model'

export const BOARD_FORMAT_VERSION = 1

const FALLBACK_POSITION = { x: 0, y: 0 }

/**
 * Run products (status, note) are never persisted: boards are meant to live
 * in git, and statuses changing on every run would churn diffs.
 */
export function serializeBoard(
  id: string,
  name: string,
  nodes: AppNode[],
  edges: AppEdge[],
  viewport?: BoardViewport,
): BoardJSON {
  const positions: Record<string, { x: number; y: number }> = {}
  const wireNodes: BoardNodeJSON[] = nodes.map((node) => {
    positions[node.id] = { x: node.position.x, y: node.position.y }
    if (node.type === 'note') {
      return { id: node.id, type: node.type, data: { ...node.data } }
    }
    const { name: nodeName, status: _status, note: _note, ...rest } = node.data
    return { id: node.id, type: node.type, name: nodeName, data: rest }
  })
  return {
    formatVersion: BOARD_FORMAT_VERSION,
    id,
    name,
    nodes: wireNodes,
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target })),
    layout: { positions, ...(viewport ? { viewport } : {}) },
  }
}

export function deserializeBoard(board: BoardJSON): {
  nodes: AppNode[]
  edges: AppEdge[]
  viewport?: BoardViewport
} {
  const nodes = board.nodes.map((wire): AppNode => {
    // An absent type means http (same rule as core.Node.EffectiveType); an
    // unknown one means a corrupt board and must fail loudly, not render as
    // some default node.
    const type = wire.type ?? 'http'
    if (!isNodeType(type)) throw new Error(`board ${board.id}: node ${wire.id} has unknown type "${type}"`)
    const position = board.layout?.positions?.[wire.id] ?? FALLBACK_POSITION
    const data = wire.data ?? {}
    switch (type) {
      case 'note':
        return { id: wire.id, type, position, data: { text: String(data.text ?? '') } }
      case 'transform':
        return { id: wire.id, type, position, data: { name: wire.name ?? wire.id, status: 'idle' } }
      case 'http': {
        const partial = data as Partial<OperationNodeData>
        return {
          id: wire.id,
          type,
          position,
          data: {
            name: wire.name ?? wire.id,
            method: (partial.method ?? 'GET') as HttpMethod,
            path: String(partial.path ?? ''),
            environment: String(partial.environment ?? ''),
            credential: String(partial.credential ?? ''),
            status: 'idle',
            repeat: Number(partial.repeat ?? 1),
            fields: Array.isArray(partial.fields) ? (partial.fields as NodeField[]) : [],
          },
        }
      }
    }
  })
  const edges: AppEdge[] = board.edges.map((e, i) => ({
    id: e.id ?? `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
  }))
  return { nodes, edges, viewport: board.layout?.viewport }
}
