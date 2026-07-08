import type { Edge, Node } from '@xyflow/svelte'

/**
 * Node type discriminator (plan 06). Only `http` nodes make requests;
 * `transform` reshapes upstream data in-process; `note` is a canvas
 * annotation that never executes. Mirrors `core.NodeType` on the Go side.
 */
export const NODE_TYPES = ['http', 'transform', 'note'] as const
export type NodeType = (typeof NODE_TYPES)[number]

export function isNodeType(value: unknown): value is NodeType {
  return NODE_TYPES.includes(value as NodeType)
}

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export function isHttpMethod(value: unknown): value is HttpMethod {
  return HTTP_METHODS.includes(value as HttpMethod)
}

export type NodeStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped' | 'stale'

export interface Operation {
  ref: string
  method: HttpMethod
  path: string
  summary: string
  group: string
}

/**
 * How a request field gets its value (plan 05 §9a): a literal, a single
 * structured reference to an upstream output, or a template interpolating
 * one or more {{…}} references into text.
 */
export type FieldSource = 'literal' | 'binding' | 'template'

/**
 * A structured reference to an upstream node's output. `nodeId` is the node
 * **ID** — the UI renders the node's key, so key renames rewrite nothing
 * stored. An empty nodeId is the `res` sugar ("my single direct upstream").
 * `path` is an accessor path (`body.id`, `status`, `headers.Location`, or an
 * export key like `userId`); empty means the whole response body.
 */
export interface FieldRef {
  nodeId: string
  path: string
}

export type NodeField = {
  key: string
  source: FieldSource
  /**
   * literal → the text; template → text with {{…}} whose references use
   * node IDs (or res/i); binding → the canonical stored reference
   * (`<nodeId>.<path>` or `res.<path>`), mirroring `ref`.
   */
  value: string
  ref?: FieldRef
}

/** A named alias a node declares for a value of its own response (plan 05 §9b). */
export interface NodeExport {
  key: string
  path: string
}

/** JSON-schema wire shape shared with core/schema/infer on the Go side. */
export interface SchemaJSON {
  type?: string | string[]
  format?: string
  nullable?: boolean
  properties?: Record<string, SchemaJSON>
  items?: SchemaJSON
}

/**
 * A node's last successful response (plan 05 §8), persisted in the board's
 * layout sidecar — enough for schema inference and picker previews without
 * keeping run history.
 */
export interface CapturedResponse {
  status: number
  headers?: Record<string, string>
  body: unknown
  /** ISO capture timestamp — shown as "inferred from last run · 14:02". */
  at: string
  /** True when the body exceeded the capture cap and was dropped. */
  truncated?: boolean
}

/** Fields shared by the node types that participate in runs (http, transform). */
export type RunnableNodeData = {
  name: string
  /** Board-unique slug other nodes reference this node by (`createUser`). */
  key: string
  status: NodeStatus
  note?: string
  /** Named aliases this node declares for values of its own output (plan 05 §9b). */
  exports?: NodeExport[]
}

/**
 * Raw request body escape hatch (plan 08 A1) for non-JSON/exact-bytes
 * payloads. When set, `body.*` fields are ignored; {{…}} templates
 * interpolate in `text`.
 */
export interface RawBody {
  contentType: string
  text: string
}

/** Provenance link to the collection request a node was created from (plan 08 B3). */
export interface RequestRef {
  collectionId: string
  requestId: string
}

export type OperationNodeData = RunnableNodeData & {
  method: HttpMethod
  path: string
  /**
   * Absolute base URL overriding the environment for this node (plan 08 A1).
   * Empty/absent ⇒ resolve against the environment's baseUrl. Normalized on
   * save: scheme+host required, no trailing slash.
   */
  origin?: string
  environment: string
  credential: string
  fields: NodeField[]
  rawBody?: RawBody
  repeat: number
  requestRef?: RequestRef
  /** Response schema pinned via "use last response as schema"; survives later runs. */
  responseSchema?: SchemaJSON
}

/** How a transform node computes its output (plan 06): declarative Pick rows or a sandboxed script. */
export const TRANSFORM_MODES = ['pick', 'script'] as const
export type TransformMode = (typeof TRANSFORM_MODES)[number]

export type TransformNodeData = RunnableNodeData & {
  mode: TransformMode
  /**
   * Pick rows: output key ← expression. Reuses the request-field shape —
   * `key` is a dot path inside the result body, the rest is the expression
   * (literal, binding ref, or template), so the field editor round-trip and
   * validation apply unchanged.
   */
  pick: NodeField[]
  script: string
}

/** Free-text sticky; not executable, no handles (plan 06 T6). */
export type NoteNodeData = {
  text: string
}

export type HttpNode = Node<OperationNodeData, 'http'>
export type TransformNode = Node<TransformNodeData, 'transform'>
export type NoteNode = Node<NoteNodeData, 'note'>
export type AppNode = HttpNode | TransformNode | NoteNode
/** The node types that run and produce an output other nodes bind against. */
export type RunnableNode = HttpNode | TransformNode
export type AppEdge = Edge

export function isHttpNode(node: AppNode): node is HttpNode {
  return node.type === 'http'
}

export function isTransformNode(node: AppNode): node is TransformNode {
  return node.type === 'transform'
}

export function isRunnableNode(node: AppNode): node is RunnableNode {
  return node.type === 'http' || node.type === 'transform'
}

export interface EnvironmentDef {
  name: string
  baseUrl: string
}

/** Credential metadata only — values live in the OS keychain (plan 04), never in the frontend. */
export interface CredentialDef {
  name: string
  kind: 'bearer' | 'api-key' | 'basic'
  createdAt: string
  config?: Record<string, string>
}

/** One entry in the project index (mirrors store.ProjectInfo). */
export interface ProjectInfo {
  id: string
  name: string
  path?: string
  lastOpenedAt?: string
}

export interface ProjectDefaults {
  environment?: string
  credential?: string
}

/** project.json content (mirrors store.ProjectMeta). */
export interface ProjectMeta {
  id: string
  name: string
  createdAt?: string
  defaults?: ProjectDefaults
}

/** An imported schema source and its parsed operation catalog (mirrors store.Source). */
export interface SourceDef {
  id: string
  title: string
  version?: string
  operations: Operation[]
}

/** Everything needed to render a freshly opened project (mirrors main.ProjectBundle). */
export interface ProjectBundle {
  project: ProjectMeta
  sources: SourceDef[]
  environments: EnvironmentDef[]
  credentials: CredentialDef[]
  boards: BoardJSON[]
}

/**
 * On-disk/wire board format (mirrors store.Board): the M1 graph JSON plus a
 * canvas-only `layout` key the engine ignores. Conversions to/from canvas
 * state live in board.ts.
 */
export interface BoardNodeJSON {
  id: string
  type?: string
  name?: string
  data?: Record<string, unknown>
}

export interface BoardEdgeJSON {
  id?: string
  from: string
  to: string
}

export interface BoardViewport {
  x: number
  y: number
  zoom: number
}

export interface BoardLayoutJSON {
  positions: Record<string, { x: number; y: number }>
  viewport?: BoardViewport
  /** Last successful response per node id (canvas-only; the engine ignores layout). */
  responses?: Record<string, CapturedResponse>
}

export interface BoardJSON {
  formatVersion: number
  id: string
  name: string
  nodes: BoardNodeJSON[]
  edges: BoardEdgeJSON[]
  layout: BoardLayoutJSON
}

interface LogEntryBase {
  id: string
  runId: string
  time: string
  node: string
  durationMs: number
  error?: string
}

export type HttpLogEntry = LogEntryBase & {
  kind: 'http'
  method: HttpMethod
  url: string
  status: number
  request?: string
  response?: string
}

/** Transform log rows record input/output instead of request/response (plan 06). */
export type TransformLogEntry = LogEntryBase & {
  kind: 'transform'
  /** Keys of the direct upstream nodes consumed. */
  inputNodes: string[]
  /** JSON of the produced body (absent on failure). */
  output?: string
}

export type LogEntry = HttpLogEntry | TransformLogEntry

/** One upstream output as handed to a transform script run (mirrors main.ScriptUpstream). */
export interface ScriptUpstream {
  status: number
  headers?: Record<string, string>
  body: unknown
}

/** One transform-script execution request (mirrors main.ScriptRunRequest). */
export interface ScriptRunRequest {
  script: string
  /** Ancestor outputs by node key (`nodes.<key>` inside the script). */
  nodes: Record<string, ScriptUpstream>
  /** The single direct upstream, when there is exactly one (`res`). */
  res?: ScriptUpstream
  index: number
}
