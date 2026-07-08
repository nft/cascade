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

/**
 * Wire protocols a request definition can use (plan 08 B1). Only 'http'
 * executes in P0; 'ws' is a reserved discriminator so collections/boards
 * never need a format break when WebSocket lands.
 */
export const REQUEST_PROTOCOLS = ['http', 'ws'] as const
export type RequestProtocol = (typeof REQUEST_PROTOCOLS)[number]

export function isRequestProtocol(value: unknown): value is RequestProtocol {
  return REQUEST_PROTOCOLS.includes(value as RequestProtocol)
}

/** Request-side schemas are per-section so the editor tabs map 1:1 (plan 08 B4). */
export interface RequestSchema {
  /** Path+query, flat. */
  params?: Record<string, SchemaJSON>
  headers?: Record<string, SchemaJSON>
  /** Nested object schema. */
  body?: SchemaJSON
}

/** One reusable request definition inside a collection (plan 08 B1). */
export interface RequestDef {
  /** Random short id — rename-safe; requestRefs point at it. */
  id: string
  name: string
  protocol: RequestProtocol
  /** Always present for protocol 'http'; absent for other protocols. */
  method?: HttpMethod
  /**
   * Path resolved against an environment ('/v1/invoices'), OR an absolute
   * URL ('https://api.stripe.com/v1/invoices') carrying its own origin.
   */
  url: string
  /**
   * Header/param/body rows copied onto new nodes. Literal-only — bindings
   * are board concepts and don't belong in a library.
   */
  defaults?: NodeField[]
  requestSchema?: RequestSchema
  /** Hand-written or inferred from a test request (plan 08 B4). */
  responseSchema?: SchemaJSON
  description?: string
}

/** One nestable folder of request definitions; depth is capped (plan 08 B1). */
export interface CollectionFolder {
  id: string
  name: string
  folders?: CollectionFolder[]
  requests: RequestDef[]
}

/** A project-scoped library of request definitions (mirrors store.Collection). */
export interface CollectionDef {
  formatVersion?: number
  id: string
  name: string
  /** Unnamed root folder; top-level items live in it. */
  root: CollectionFolder
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

/** The credential injection matrix (plan 04): each kind is a rule for where the secret enters a request. */
export const CREDENTIAL_KINDS = ['bearer', 'basic', 'header', 'query'] as const
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]

/** Credential metadata only — values live in the OS keychain (plan 04), never in the frontend. */
export interface CredentialDef {
  name: string
  kind: CredentialKind
  /** Kind 'header': the header name, e.g. 'X-Internal-Token'. */
  header?: string
  /** Kind 'query': the query parameter name. */
  param?: string
  /** Optional value template with one {secret} placeholder; absent means the bare secret. */
  template?: string
  /** Kind 'basic': the username; the secret is the password. */
  username?: string
  createdAt: string
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
  collections: CollectionDef[]
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

/**
 * One-off request execution outside any board run (plan 08 B4, mirrors
 * main.TestRequest): everything is pre-resolved — literal values only, no
 * bindings. `origin` (from an absolute request URL) takes precedence over
 * `envBase`; the Go side joins, injects the named credential, and sends.
 */
export interface TestRequest {
  protocol?: RequestProtocol
  method: HttpMethod
  origin?: string
  envBase?: string
  /** May contain {placeholders}, substituted from pathParams. */
  path: string
  pathParams?: Record<string, string>
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: unknown
  rawBody?: RawBody
  /** Credential name; empty/absent means none. Values never leave the Go side. */
  credential?: string
}

/** The captured outcome of a test request (mirrors main.TestResponse). */
export interface TestResponse {
  status: number
  headers?: Record<string, string>
  /** Parsed body when it is JSON; absent otherwise. */
  body?: unknown
  /** Raw body text, capped at the capture limit. */
  bodyText: string
  truncated?: boolean
  durationMs: number
  /** The final URL sent (path substituted, query appended). */
  url: string
  /** Headers as sent, with credential-injected values redacted. */
  sentHeaders?: Record<string, string>
}

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
