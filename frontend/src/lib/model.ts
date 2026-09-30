import type { Edge, Node } from '@xyflow/svelte'

/**
 * Node type discriminator. Only `http` nodes make requests;
 * `transform` reshapes upstream data in-process; `note` is a canvas
 * annotation that never executes; `mock` emits user-authored static JSON,
 * `delay` holds its branch for a duration, and `for` is a container that
 * runs its child nodes repeatedly. Mirrors `core.NodeType`
 * on the Go side.
 */
export const NODE_TYPES = ['http', 'transform', 'note', 'mock', 'delay', 'for'] as const
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
 * How a request field gets its value: a literal, a single
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
  /**
   * Written by selection export when the field's reference left
   * the selection: what it was bound to, by the upstream's key, so the
   * receiving side can show "was bound to createUser.body.id" and re-bind.
   */
  dangling?: { originalKey: string; path: string }
}

/** A named alias a node declares for a value of its own response. */
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
 * A node's last successful response, persisted in the board's
 * layout sidecar — enough for schema inference and picker previews without
 * keeping run history.
 */
export interface CapturedResponse {
  status: number
  headers?: Record<string, string>
  /**
   * Absent on a board saved with response capture off — read it
   * through `capturedSchema`/`capturedBodyShape` rather than directly, so a
   * bodyless capture still answers what shape the response had.
   */
  body?: unknown
  /** Inferred when the capture arrives, so it outlives a body that is never persisted. */
  schema?: SchemaJSON
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
  /** Named aliases this node declares for values of its own output. */
  exports?: NodeExport[]
}

/**
 * Raw request body escape hatch for non-JSON/exact-bytes
 * payloads. When set, `body.*` fields are ignored; {{…}} templates
 * interpolate in `text`.
 */
export interface RawBody {
  contentType: string
  text: string
}

/** Provenance link to the collection request a node was created from. */
export interface RequestRef {
  collectionId: string
  requestId: string
}

/**
 * Wire protocols a request definition can use. Only 'http'
 * executes; 'ws' is a reserved discriminator so collections/boards
 * never need a format break when WebSocket lands.
 */
export const REQUEST_PROTOCOLS = ['http', 'ws'] as const
export type RequestProtocol = (typeof REQUEST_PROTOCOLS)[number]

export function isRequestProtocol(value: unknown): value is RequestProtocol {
  return REQUEST_PROTOCOLS.includes(value as RequestProtocol)
}

/** Request-side schemas are per-section so the editor tabs map 1:1. */
export interface RequestSchema {
  /** Path+query, flat. */
  params?: Record<string, SchemaJSON>
  headers?: Record<string, SchemaJSON>
  /** Nested object schema. */
  body?: SchemaJSON
}

/** One reusable request definition inside a collection. */
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
  /** Raw-body request definition; copied onto instantiated nodes. */
  rawBody?: RawBody
  requestSchema?: RequestSchema
  /** Hand-written or inferred from a test request. */
  responseSchema?: SchemaJSON
  description?: string
}

/** One nestable folder of request definitions; depth is capped. */
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
   * Absolute base URL overriding the environment for this node.
   * Empty/absent ⇒ resolve against the environment's baseUrl. Normalized on
   * save: scheme+host required, no trailing slash.
   */
  origin?: string
  environment: string
  credential: string
  fields: NodeField[]
  rawBody?: RawBody
  requestRef?: RequestRef
  /** Response schema pinned via "use last response as schema"; survives later runs. */
  responseSchema?: SchemaJSON
}

/** How a transform node computes its output: declarative Pick rows or a sandboxed script. */
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
  /**
   * When what this transform computes (its mode or script) was last edited,
   * ISO. Compared against the last capture's time so the card can tell a
   * result shape that still describes this code from one an earlier version
   * produced (nodeIO `isResultStale`).
   */
  transformEditedAt?: string
}

/** Free-text sticky; not executable, no handles. */
export type NoteNodeData = {
  text: string
}

/** Default mock output status, so downstream `status` bindings behave like a real call. */
export const MOCK_DEFAULT_STATUS = 200

/**
 * A pure data source: running the node emits the authored JSON as
 * its output body. `body` is JSON *text* (authoring format; parsed at run
 * time) and strictly literal — {{…}} templates are not resolved; reshaping
 * upstream data is what transform nodes are for. Named `statusCode` (the
 * plan says `status`) because RunnableNodeData.status already carries the
 * run state.
 */
export type MockNodeData = RunnableNodeData & {
  body: string
  statusCode: number
}

export const DELAY_DEFAULT_MS = 1000
export const DELAY_MIN_MS = 1
/** 5 min — a typo'd huge delay must not wedge a run for hours. */
export const DELAY_MAX_MS = 300_000

/** A timed gate: waits `durationMs`, then releases its downstream. */
export type DelayNodeData = RunnableNodeData & {
  durationMs: number
}

export const FOR_MODES = ['count', 'each'] as const
export type ForMode = (typeof FOR_MODES)[number]

export const FOR_MIN_COUNT = 1
export const FOR_MAX_ITERATIONS = 10_000
/** Fresh count-mode containers start at a value that reads as "a loop". */
export const FOR_DEFAULT_COUNT = 3

/**
 * The For container: runs the child nodes placed inside it N times
 * (`count` mode) or once per element of an upstream array (`each` mode). Its
 * output aggregates every child's output, keyed by child key, one array
 * element per iteration.
 */
export type ForNodeData = RunnableNodeData & {
  mode: ForMode
  count: number
  /** each-mode: binding ref that must resolve to an array. */
  source?: FieldRef
  /** Live run progress shown in the header ("3/20"); transient, never saved. */
  progress?: { done: number; total: number }
}

export type HttpNode = Node<OperationNodeData, 'http'>
export type TransformNode = Node<TransformNodeData, 'transform'>
export type NoteNode = Node<NoteNodeData, 'note'>
export type MockNode = Node<MockNodeData, 'mock'>
export type DelayNode = Node<DelayNodeData, 'delay'>
export type ForNode = Node<ForNodeData, 'for'>
export type AppNode = HttpNode | TransformNode | NoteNode | MockNode | DelayNode | ForNode
/** The node types that run and produce an output other nodes bind against. */
export type RunnableNode = HttpNode | TransformNode | MockNode | DelayNode | ForNode
export type AppEdge = Edge

export function isHttpNode(node: AppNode): node is HttpNode {
  return node.type === 'http'
}

export function isTransformNode(node: AppNode): node is TransformNode {
  return node.type === 'transform'
}

export function isMockNode(node: AppNode): node is MockNode {
  return node.type === 'mock'
}

export function isDelayNode(node: AppNode): node is DelayNode {
  return node.type === 'delay'
}

export function isForNode(node: AppNode): node is ForNode {
  return node.type === 'for'
}

export function isRunnableNode(node: AppNode): node is RunnableNode {
  return node.type !== 'note'
}

export interface EnvironmentDef {
  name: string
  baseUrl: string
}

/** The credential injection matrix: each kind is a rule for where the secret enters a request. */
export const CREDENTIAL_KINDS = ['bearer', 'basic', 'header', 'query'] as const
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number]

/** Credential metadata only — values live in the OS keychain, never in the frontend. */
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
  /**
   * Whether response bodies may be written into this project's board files.
   * Absent means yes — read it through `capturesResponses`.
   */
  captureResponses?: boolean
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
 * On-disk/wire board format (mirrors store.Board): the core graph JSON plus a
 * canvas-only `layout` key the engine ignores. Conversions to/from canvas
 * state live in board.ts.
 */
export interface BoardNodeJSON {
  id: string
  type?: string
  name?: string
  /** For container this node lives in; absent means top level. */
  parent?: string
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
  /** Explicit node sizes (resizable For containers only). */
  sizes?: Record<string, { width: number; height: number }>
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

// --- share envelope: mirrors share/envelope.go ---------------------

export interface EnvelopeRequires {
  environments: string[]
  credentials: { name: string; kind?: CredentialKind }[]
  /** Reserved — exporters emit an empty list until nodes reference sources. */
  sources: unknown[]
}

export interface EnvelopePayload {
  kind: 'board' | 'selection'
  formatVersion: number
  app: string
  board: BoardJSON
  requires: EnvelopeRequires
  collections?: CollectionDef[]
}

/** Paste probe result (mirrors main.ClipboardEnvelope); found=false means no envelope. */
export interface ClipboardEnvelope {
  found: boolean
  payload?: EnvelopePayload
}

/** File import result (mirrors main.ImportBoardResult); cancelled means dialog dismissed. */
export interface ImportBoardResult {
  cancelled: boolean
  board: BoardJSON
  /** Envelope requires, driving the mapping step; absent when cancelled. */
  requires?: EnvelopeRequires
  /** Embedded request definitions to merge into the project's library. */
  collections?: CollectionDef[]
}

interface LogEntryBase {
  id: string
  runId: string
  time: string
  node: string
  /** Originating node id — advisory: the node may have been deleted since the run. */
  nodeId: string
  durationMs: number
  error?: string
  /**
   * Loop iteration this row ran in, 0-based like exec.Record.Iteration;
   * absent outside loops. LogsPanel labels it 1-based ("createUser · #3").
   */
  iteration?: number
}

export type HttpLogEntry = LogEntryBase & {
  kind: 'http'
  method: HttpMethod
  url: string
  /** Absent when the call never reached a server (DNS, refused, timeout) — 0 is not a usable stand-in. */
  status?: number
  request?: string
  response?: string
}

/** Transform log rows record input/output instead of request/response. */
export type TransformLogEntry = LogEntryBase & {
  kind: 'transform'
  /** Keys of the direct upstream nodes consumed. */
  inputNodes: string[]
  /** JSON of the produced body (absent on failure). */
  output?: string
}

/** Whole-loop summary row closing each For run — the anchor its iteration rows group under. */
export type ForLogEntry = LogEntryBase & {
  kind: 'for'
  /** Iterations that completed — short of the plan when the loop failed fast. */
  iterations: number
}

/** Mock rows record the configured status and the emitted body. */
export type MockLogEntry = LogEntryBase & {
  kind: 'mock'
  status: number
  /** JSON of the emitted body (absent on a parse failure). */
  output?: string
}

/** Delay rows record only the wait — durationMs on the base is the payload. */
export type DelayLogEntry = LogEntryBase & {
  kind: 'delay'
}

export type LogEntry = HttpLogEntry | TransformLogEntry | ForLogEntry | MockLogEntry | DelayLogEntry

/**
 * One-off request execution outside any board run (mirrors
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
  /** Each-mode loop element (`item` inside the script); hasItem gates it. */
  item?: unknown
  hasItem?: boolean
}
