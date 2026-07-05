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

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type NodeStatus = 'idle' | 'running' | 'success' | 'failed' | 'skipped' | 'stale'

export interface Operation {
  ref: string
  method: HttpMethod
  path: string
  summary: string
  group: string
}

/** A single request field on a node: a literal value or a binding to an upstream output. */
export type FieldSource = 'literal' | 'binding'

export type NodeField = {
  key: string
  source: FieldSource
  value: string
}

/** Fields shared by the node types that participate in runs (http, transform). */
export type RunnableNodeData = {
  name: string
  status: NodeStatus
  note?: string
}

export type OperationNodeData = RunnableNodeData & {
  method: HttpMethod
  path: string
  environment: string
  credential: string
  fields: NodeField[]
  repeat: number
}

/** Transform config (mode, pick rows, script) lands with plan 06 T3–T5. */
export type TransformNodeData = RunnableNodeData

/** Free-text sticky; not executable, no handles (card lands with plan 06 T6). */
export type NoteNodeData = {
  text: string
}

export type HttpNode = Node<OperationNodeData, 'http'>
export type TransformNode = Node<TransformNodeData, 'transform'>
export type NoteNode = Node<NoteNodeData, 'note'>
export type AppNode = HttpNode | TransformNode | NoteNode
export type AppEdge = Edge

export function isHttpNode(node: AppNode): node is HttpNode {
  return node.type === 'http'
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
}

export interface BoardJSON {
  formatVersion: number
  id: string
  name: string
  nodes: BoardNodeJSON[]
  edges: BoardEdgeJSON[]
  layout: BoardLayoutJSON
}

export interface LogEntry {
  id: string
  runId: string
  time: string
  node: string
  method: HttpMethod
  url: string
  status: number
  durationMs: number
  error?: string
  request?: string
  response?: string
}
