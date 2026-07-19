// Conversions between canvas state (AppNode/AppEdge) and the on-disk board
// format (plan 01 P5). The wire format is the M1 graph JSON (id/type/name per
// node, from/to per edge) with node form data carried opaquely under `data`
// and canvas-only layout (positions, viewport, last responses) in a sibling
// `layout` key.
import {
  DELAY_DEFAULT_MS,
  FOR_MIN_COUNT,
  isHttpMethod,
  isNodeType,
  MOCK_DEFAULT_STATUS,
  type AppEdge,
  type AppNode,
  type BoardJSON,
  type BoardNodeJSON,
  type BoardViewport,
  type CapturedResponse,
  type DelayNodeData,
  type FieldRef,
  type ForNodeData,
  type MockNodeData,
  type NodeExport,
  type NodeField,
  type OperationNodeData,
  type RawBody,
  type RequestRef,
  type SchemaJSON,
  type TransformNodeData,
} from './model'
import { isValidKey, slugifyKey, uniqueKey } from './refs'

export const BOARD_FORMAT_VERSION = 1

const FALLBACK_POSITION = { x: 0, y: 0 }

const FIELD_SOURCES: ReadonlySet<string> = new Set(['literal', 'binding', 'template'])

/** Separator of the pre-plan-05 display-string binding format ("Create User → response.body.id"). */
const LEGACY_BINDING_SEPARATOR = ' → '
/** Pre-plan-05 iteration-index placeholder in literals; now the {{i}} template reference. */
const LEGACY_INDEX_TOKEN = '{i}'

/**
 * Run products (status, note) are never persisted: boards are meant to live
 * in git, and statuses changing on every run would churn diffs. Last
 * responses do persist (in layout) — they power schema inference and picker
 * previews on machines that never ran the board (plan 05 §8).
 */
export function serializeBoard(
  id: string,
  name: string,
  nodes: AppNode[],
  edges: AppEdge[],
  viewport?: BoardViewport,
  responses?: Record<string, CapturedResponse>,
): BoardJSON {
  const positions: Record<string, { x: number; y: number }> = {}
  const wireNodes: BoardNodeJSON[] = nodes.map((node) => {
    // Children of a For store container-relative positions — the same
    // coordinates xyflow works in, so serialize/deserialize never converts.
    positions[node.id] = { x: node.position.x, y: node.position.y }
    if (node.type === 'note') {
      return { id: node.id, type: node.type, data: { ...node.data } }
    }
    const { name: nodeName, status: _status, note: _note, ...rest } = node.data
    return {
      id: node.id,
      type: node.type,
      name: nodeName,
      ...(node.parentId ? { parent: node.parentId } : {}),
      data: rest,
    }
  })
  // Responses of deleted nodes must not linger in the file.
  const nodeIds = new Set(nodes.map((n) => n.id))
  const keptResponses = Object.fromEntries(
    Object.entries(responses ?? {}).filter(([nodeId]) => nodeIds.has(nodeId)),
  )
  return {
    formatVersion: BOARD_FORMAT_VERSION,
    id,
    name,
    nodes: wireNodes,
    edges: edges.map((e) => ({ id: e.id, from: e.source, to: e.target })),
    layout: {
      positions,
      ...(viewport ? { viewport } : {}),
      ...(Object.keys(keptResponses).length > 0 ? { responses: keptResponses } : {}),
    },
  }
}

export function deserializeBoard(board: BoardJSON): {
  nodes: AppNode[]
  edges: AppEdge[]
  viewport?: BoardViewport
  responses: Record<string, CapturedResponse>
} {
  const nodes = board.nodes.map((wire): AppNode => {
    // An absent type means http (same rule as core.Node.EffectiveType); an
    // unknown one means a corrupt board and must fail loudly, not render as
    // some default node.
    const type = wire.type ?? 'http'
    if (!isNodeType(type)) throw new Error(`board ${board.id}: node ${wire.id} has unknown type "${type}"`)
    const position = board.layout?.positions?.[wire.id] ?? FALLBACK_POSITION
    const data = wire.data ?? {}
    const key = typeof data.key === 'string' ? data.key : ''
    // Containment (plan 09): only the loop-body allowlist may carry a parent;
    // anything else (note, nested for, hand-edited junk) loads unparented
    // rather than failing the board.
    const parented =
      typeof wire.parent === 'string' &&
      wire.parent !== '' &&
      (type === 'http' || type === 'transform' || type === 'mock' || type === 'delay')
        ? { parentId: wire.parent }
        : {}
    switch (type) {
      case 'note':
        return { id: wire.id, type, position, data: { text: String(data.text ?? '') } }
      case 'mock': {
        const partial = data as Partial<MockNodeData>
        return {
          id: wire.id,
          type,
          position,
          ...parented,
          data: {
            name: wire.name ?? wire.id,
            key,
            status: 'idle',
            body: typeof partial.body === 'string' ? partial.body : '{}',
            statusCode:
              typeof partial.statusCode === 'number' ? partial.statusCode : MOCK_DEFAULT_STATUS,
            ...(Array.isArray(partial.exports) ? { exports: partial.exports as NodeExport[] } : {}),
          },
        }
      }
      case 'delay': {
        const partial = data as Partial<DelayNodeData>
        return {
          id: wire.id,
          type,
          position,
          ...parented,
          data: {
            name: wire.name ?? wire.id,
            key,
            status: 'idle',
            durationMs:
              typeof partial.durationMs === 'number' ? partial.durationMs : DELAY_DEFAULT_MS,
            ...(Array.isArray(partial.exports) ? { exports: partial.exports as NodeExport[] } : {}),
          },
        }
      }
      case 'for': {
        const partial = data as Partial<ForNodeData>
        return {
          id: wire.id,
          type,
          position,
          data: {
            name: wire.name ?? wire.id,
            key,
            status: 'idle',
            mode: partial.mode === 'each' ? 'each' : 'count',
            count: typeof partial.count === 'number' ? partial.count : FOR_MIN_COUNT,
            ...(isFieldRef(partial.source) ? { source: partial.source } : {}),
            ...(Array.isArray(partial.exports) ? { exports: partial.exports as NodeExport[] } : {}),
          },
        }
      }
      case 'transform': {
        const partial = data as Partial<TransformNodeData>
        return {
          id: wire.id,
          type,
          position,
          ...parented,
          data: {
            name: wire.name ?? wire.id,
            key,
            status: 'idle',
            mode: partial.mode === 'script' ? 'script' : 'pick',
            pick: Array.isArray(partial.pick) ? (partial.pick as NodeField[]) : [],
            script: typeof partial.script === 'string' ? partial.script : '',
            ...(Array.isArray(partial.exports) ? { exports: partial.exports as NodeExport[] } : {}),
          },
        }
      }
      case 'http': {
        const partial = data as Partial<OperationNodeData>
        return {
          id: wire.id,
          type,
          position,
          ...parented,
          data: {
            name: wire.name ?? wire.id,
            key,
            // An unknown method means a hand-edited/newer board; degrade to
            // GET rather than carry an unrenderable value through the UI.
            method: isHttpMethod(partial.method) ? partial.method : 'GET',
            path: String(partial.path ?? ''),
            ...(typeof partial.origin === 'string' && partial.origin !== ''
              ? { origin: partial.origin }
              : {}),
            environment: String(partial.environment ?? ''),
            credential: String(partial.credential ?? ''),
            status: 'idle',
            fields: Array.isArray(partial.fields) ? (partial.fields as NodeField[]) : [],
            ...(isRawBody(partial.rawBody) ? { rawBody: partial.rawBody } : {}),
            ...(isRequestRef(partial.requestRef) ? { requestRef: partial.requestRef } : {}),
            ...(Array.isArray(partial.exports)
              ? { exports: partial.exports as NodeExport[] }
              : {}),
            ...(partial.responseSchema && typeof partial.responseSchema === 'object'
              ? { responseSchema: partial.responseSchema as SchemaJSON }
              : {}),
          },
        }
      }
    }
  })
  // xyflow requires a container to appear before its children in the nodes
  // array; a stable partition (top-level nodes first, then children) keeps
  // that true regardless of how the file interleaves them.
  const ordered = [...nodes.filter((n) => !n.parentId), ...nodes.filter((n) => n.parentId)]
  assignKeys(ordered)
  migrateLegacyFields(ordered)
  const edges: AppEdge[] = board.edges.map((e, i) => ({
    id: e.id ?? `e-${e.from}-${e.to}-${i}`,
    source: e.from,
    target: e.to,
  }))
  return {
    nodes: ordered,
    edges,
    viewport: board.layout?.viewport,
    responses: board.layout?.responses ?? {},
  }
}

function isFieldRef(value: unknown): value is FieldRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Partial<FieldRef>
  return typeof ref.nodeId === 'string' && typeof ref.path === 'string'
}

function isRawBody(value: unknown): value is RawBody {
  if (!value || typeof value !== 'object') return false
  const raw = value as Partial<RawBody>
  return typeof raw.contentType === 'string' && typeof raw.text === 'string'
}

export function isRequestRef(value: unknown): value is RequestRef {
  if (!value || typeof value !== 'object') return false
  const ref = value as Partial<RequestRef>
  return typeof ref.collectionId === 'string' && typeof ref.requestId === 'string'
}

/**
 * Every runnable node needs a board-unique key (plan 05 §9a). Boards saved
 * before keys existed have none — derive from the node name, deduplicating in
 * declaration order so re-opening the same board yields the same keys.
 */
function assignKeys(nodes: AppNode[]): void {
  const taken = new Set<string>()
  for (const node of nodes) {
    if (node.type === 'note') continue
    if (isValidKey(node.data.key) && !taken.has(node.data.key)) {
      taken.add(node.data.key)
      continue
    }
    const key = uniqueKey(slugifyKey(node.data.name), taken)
    taken.add(key)
    node.data = { ...node.data, key }
  }
}

/**
 * Rewrites pre-plan-05 field shapes in place: display-string bindings
 * ("Create User → response.body.id") become structured ID-backed refs, and
 * literals carrying the old {i} placeholder become {{i}} templates. Unknown
 * shapes degrade to literals — a load must never throw over a field.
 */
function migrateLegacyFields(nodes: AppNode[]): void {
  const idByName = new Map<string, string>()
  for (const node of nodes) {
    if (node.type !== 'note') idByName.set(node.data.name, node.id)
  }
  for (const node of nodes) {
    if (node.type !== 'http') continue
    node.data = {
      ...node.data,
      fields: node.data.fields.map((field) => migrateField(field, idByName)),
    }
  }
}

function migrateField(field: NodeField, idByName: Map<string, string>): NodeField {
  if (!FIELD_SOURCES.has(field.source)) {
    return { key: field.key, source: 'literal', value: String(field.value ?? '') }
  }
  if (field.source === 'literal' && field.value.includes(LEGACY_INDEX_TOKEN)) {
    return { key: field.key, source: 'template', value: field.value.replaceAll(LEGACY_INDEX_TOKEN, '{{i}}') }
  }
  if (field.source !== 'binding' || field.ref) return field
  const sep = field.value.indexOf(LEGACY_BINDING_SEPARATOR)
  if (sep < 0) {
    return { key: field.key, source: 'literal', value: field.value }
  }
  const nodeId = idByName.get(field.value.slice(0, sep))
  if (!nodeId) {
    return { key: field.key, source: 'literal', value: field.value }
  }
  let path = field.value.slice(sep + LEGACY_BINDING_SEPARATOR.length).trim()
  if (path === 'response') path = ''
  else if (path.startsWith('response.')) path = path.slice('response.'.length)
  const ref: FieldRef = { nodeId, path }
  const stored = path ? `${nodeId}.${path}` : nodeId
  return { key: field.key, source: 'binding', value: stored, ref }
}
