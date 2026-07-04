import type { Edge, Node } from '@xyflow/svelte'

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

export type OperationNodeData = {
  name: string
  method: HttpMethod
  path: string
  environment: string
  credential: string
  status: NodeStatus
  fields: NodeField[]
  repeat: number
  note?: string
}

export type AppNode = Node<OperationNodeData, 'operation'>
export type AppEdge = Edge

export interface EnvironmentDef {
  name: string
  baseUrl: string
}

export interface CredentialDef {
  name: string
  type: 'bearer' | 'api-key' | 'basic'
  createdAt: string
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
