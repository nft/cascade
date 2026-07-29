// What a node card says about its data flow: the upstream values it reads,
// the shape of the body it produces, and the names its outgoing edges carry.
// Pure, so the cards stay markup and the rules stay unit-tested.
import {
  isDelayNode,
  isRunnableNode,
  isTransformNode,
  type AppEdge,
  type AppNode,
  type CapturedResponse,
  type NodeField,
  type OperationNodeData,
  type RawBody,
  type RunnableNodeData,
  type SchemaJSON,
  type TransformNodeData,
  type FieldRef,
} from './model'
import { fieldDisplayValue, fieldRefs, refToDisplay } from './refs'
import { inferSchema, typeLabel } from './schema'

/** Chips a card shows before collapsing the rest into "+N". */
export const CARD_CHIP_CAP = 2
/** Pick rows a transform card shows before collapsing the rest into "+N". */
export const CARD_ROW_CAP = 3
/** Body fields a request card lists; the rest are implied by the key count. */
export const CARD_FIELD_CAP = 3
/** Names an edge spells out before collapsing the rest into "+N". */
export const EDGE_LABEL_CAP = 2

/** Shown for a pick row whose expression is still empty. */
export const EMPTY_EXPR_LABEL = '—'

/** Synthetic field key for the raw-body template, which is not a NodeField. */
const RAW_BODY_FIELD_KEY = 'rawBody'

export interface Overflow<T> {
  shown: T[]
  more: number
}

export function withOverflow<T>(items: readonly T[], cap: number): Overflow<T> {
  return { shown: items.slice(0, cap), more: Math.max(0, items.length - cap) }
}

// --- what a node reads -------------------------------------------------------

/** References made by a request's fields plus its raw body, which templates too. */
function requestRefs(fields: readonly NodeField[], rawBody: RawBody | undefined): FieldRef[] {
  const refs = fields.flatMap(fieldRefs)
  if (rawBody) refs.push(...fieldRefs({ key: RAW_BODY_FIELD_KEY, source: 'template', value: rawBody.text }))
  return refs
}

/**
 * Upstream values a request node reads, in editor display form
 * (`createUser.body.id`, `res.title`), deduped and in field order.
 */
export function httpInputRefs(data: OperationNodeData, keys: ReadonlyMap<string, string>): string[] {
  const labels: string[] = []
  for (const ref of requestRefs(data.fields, data.rawBody)) {
    const label = refToDisplay(ref, keys)
    if (!labels.includes(label)) labels.push(label)
  }
  return labels
}

// --- what a node hands downstream --------------------------------------------

/** Named values a node declares for downstream references. */
export function exportKeys(data: RunnableNodeData): string[] {
  return (data.exports ?? []).map((e) => e.key)
}

/**
 * A transform's exports plus, in pick mode, its row keys — those *are* its
 * output shape. Only the first path segment is offered: a row keyed `user.id`
 * writes into `user`, and `user` is where a downstream reference starts.
 */
export function transformOutputKeys(data: TransformNodeData): string[] {
  const keys = exportKeys(data)
  if (data.mode !== 'pick') return keys
  for (const row of data.pick) {
    const top = row.key.split('.')[0]
    if (top !== '' && !keys.includes(top)) keys.push(top)
  }
  return keys
}

/** A delay proxies one upstream; with none or several it is a gate, not a joiner. */
const DELAY_PASSTHROUGH_UPSTREAMS = 1

function directUpstreamIds(edges: readonly AppEdge[], nodeId: string): string[] {
  return edges.filter((e) => e.target === nodeId).map((e) => e.source)
}

/**
 * The names this node hands to every node after it — what its outgoing edges
 * are labelled with. Empty means the edge only orders the run as far as names
 * go; the whole response body is still reachable through `res`.
 *
 * A delay is transparent: it waits, then hands its single upstream's output
 * downstream unchanged (core/exec delayOutput), so it sends on whatever
 * reached it — through a chain of delays if need be. Names it exports itself
 * come first: those are aliases the user wrote for that same body.
 */
export function nodeSendKeys(
  node: AppNode,
  nodes: readonly AppNode[],
  edges: readonly AppEdge[],
): string[] {
  return sendKeys(node, nodes, edges, new Set())
}

function sendKeys(
  node: AppNode,
  nodes: readonly AppNode[],
  edges: readonly AppEdge[],
  seen: Set<string>,
): string[] {
  // An imported board could carry a cycle the editor would have rejected;
  // walking a delay chain must terminate regardless.
  if (!isRunnableNode(node) || seen.has(node.id)) return []
  seen.add(node.id)
  if (isTransformNode(node)) return transformOutputKeys(node.data)
  const keys = exportKeys(node.data)
  if (!isDelayNode(node)) return keys
  const ups = directUpstreamIds(edges, node.id)
  if (ups.length !== DELAY_PASSTHROUGH_UPSTREAMS) return keys
  const upstream = nodes.find((n) => n.id === ups[0])
  if (!upstream) return keys
  return [...new Set([...keys, ...sendKeys(upstream, nodes, edges, seen)])]
}

/** One edge's label: the first names the source sends, then "+N" for the rest. */
export function formatEdgeLabel(keys: readonly string[]): string {
  const { shown, more } = withOverflow(keys, EDGE_LABEL_CAP)
  const head = shown.join(', ')
  return more > 0 ? `${head} +${more}` : head
}

// --- the body a node produces -------------------------------------------------

export interface BodyField {
  key: string
  type: string
}

export interface BodyShape {
  /** The body's own annotation: `object`, `array of object`, `string · uuid`. */
  type: string
  /** Top-level fields of the body, or of one array element. */
  fields: BodyField[]
}

/**
 * The card-sized reading of a response schema — top level only, so a deep
 * schema costs no more than a shallow one. An array describes itself through
 * its element: "array of object" with the element's keys is what tells you
 * whether the call returned what you expected.
 */
export function bodyShape(schema: SchemaJSON): BodyShape {
  const item = schema.items
  const source = item ?? schema
  return {
    type: item ? `array of ${typeLabel(item)}` : typeLabel(schema),
    fields: Object.entries(source.properties ?? {}).map(([key, child]) => ({
      key,
      type: typeLabel(child),
    })),
  }
}

/**
 * Inference walks the whole captured body (256 KB at the cap) and every
 * capture during a run replaces `app.responses`, invalidating every card's
 * derived state at once. Keying on the capture object holds that to one walk
 * per response instead of one per render.
 */
const shapeByCapture = new WeakMap<CapturedResponse, BodyShape>()

/**
 * The schema a request card draws its body from: the pinned one first, then
 * whatever the last response inferred. Mirrors the binding picker's
 * precedence (picker.ts `nodeSchemaSource`), minus the spec source it has no
 * room to distinguish.
 */
export function httpBodyShape(
  data: OperationNodeData,
  captured: CapturedResponse | undefined,
): BodyShape | null {
  if (data.responseSchema) return bodyShape(data.responseSchema)
  if (!captured || captured.truncated) return null
  const cached = shapeByCapture.get(captured)
  if (cached) return cached
  const shape = bodyShape(inferSchema(captured.body))
  shapeByCapture.set(captured, shape)
  return shape
}

// --- transform pick rows ------------------------------------------------------

export interface PickRowSummary {
  key: string
  /** The row's expression as the inspector shows it (node keys, not IDs). */
  expr: string
}

/** `key ← expression` pairs for a pick transform's card body. */
export function pickRowSummaries(
  rows: readonly NodeField[],
  keys: ReadonlyMap<string, string>,
): PickRowSummary[] {
  return rows.map((row) => ({
    key: row.key,
    expr: fieldDisplayValue(row, keys) || EMPTY_EXPR_LABEL,
  }))
}
