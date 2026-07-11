// Import mapping (plan 07 E4/E5): the pure logic behind the requires-mapping
// wizard and the embedded-collections merge. Auto-matching happens by exact
// name; only what did not match reaches the dialog, and every resolution
// degrades gracefully — leaving a requirement unmapped keeps the imported
// nodes present (they surface via the plan-04 dangling badges), never fails
// the import.
import { findRequest, flattenRequests } from './collections'
import type {
  AppNode,
  CollectionDef,
  CredentialDef,
  CredentialKind,
  EnvelopeRequires,
  EnvironmentDef,
  RequestDef,
} from './model'
import { isHttpNode } from './model'

/** What a requirement can bind to in the target project. */
export type RequirementType = 'environment' | 'credential'

/** One unmatched `requires` entry the wizard renders a row for. */
export interface RequirementRow {
  type: RequirementType
  name: string
  /** Credential kind hint from the exporter — informational, never a value. */
  kind?: CredentialKind
}

/**
 * A row's resolution: create a placeholder carrying the required name, remap
 * the imported nodes onto an existing name, or leave the reference unmapped.
 */
export type RequirementResolution =
  | { action: 'create' }
  | { action: 'existing'; target: string }
  | { action: 'skip' }

/**
 * The requires entries with no exact-name match in the project — the wizard's
 * rows. An empty result means zero-dialog import.
 */
export function unmatchedRequirements(
  requires: EnvelopeRequires | undefined,
  environments: readonly EnvironmentDef[],
  credentials: readonly CredentialDef[],
): RequirementRow[] {
  if (!requires) return []
  const envNames = new Set(environments.map((e) => e.name))
  const credNames = new Set(credentials.map((c) => c.name))
  return [
    ...(requires.environments ?? [])
      .filter((name) => !envNames.has(name))
      .map((name): RequirementRow => ({ type: 'environment', name })),
    ...(requires.credentials ?? [])
      .filter((c) => !credNames.has(c.name))
      .map((c): RequirementRow => ({ type: 'credential', name: c.name, kind: c.kind })),
  ]
}

/** Placeholder environment: the required name, base URL left for the user. */
export function placeholderEnvironment(name: string): EnvironmentDef {
  return { name, baseUrl: '' }
}

/**
 * Placeholder credential: metadata only, no secret — runs error with an
 * actionable "no stored secret value" message until the user enters one via
 * Rotate. Header/query kinds need a target name the envelope does not carry,
 * so those hints fall back to bearer; the user adjusts the kind when editing.
 */
export function placeholderCredential(name: string, kindHint: CredentialKind | undefined, createdAt: string): CredentialDef {
  const kind: CredentialKind = kindHint === 'basic' ? 'basic' : 'bearer'
  return { name, kind, createdAt }
}

/** A rename to apply to imported nodes: every `from` reference becomes `to`. */
export interface TargetRename {
  type: RequirementType
  from: string
  to: string
}

/**
 * Rewrites environment/credential references on the given nodes (immutably)
 * per the wizard's map-to-existing choices. Only the imported/pasted nodes
 * are touched — the rest of the board keeps its references.
 */
export function renameNodeTargets(
  nodes: readonly AppNode[],
  nodeIds: ReadonlySet<string>,
  renames: readonly TargetRename[],
): AppNode[] {
  if (renames.length === 0) return [...nodes]
  const envMap = new Map(renames.filter((r) => r.type === 'environment').map((r) => [r.from, r.to]))
  const credMap = new Map(renames.filter((r) => r.type === 'credential').map((r) => [r.from, r.to]))
  return nodes.map((n) => {
    if (!nodeIds.has(n.id) || !isHttpNode(n)) return n
    const environment = envMap.get(n.data.environment)
    const credential = credMap.get(n.data.credential)
    if (environment === undefined && credential === undefined) return n
    return {
      ...n,
      data: {
        ...n.data,
        environment: environment ?? n.data.environment,
        credential: credential ?? n.data.credential,
      },
    }
  })
}

/**
 * Merges envelope-embedded collections into the project's library and returns
 * only the collections that need saving. Dedup is by ID: an unknown
 * collection imports as-is (trimmed to the requests the exporter embedded); a
 * known one gains only the requests it is missing, appended to its root — a
 * request whose ID is already present anywhere in the tree is reused, not
 * duplicated.
 */
export function mergeCollections(
  existing: readonly CollectionDef[],
  embedded: readonly CollectionDef[] | undefined,
): CollectionDef[] {
  if (!embedded || embedded.length === 0) return []
  const byId = new Map(existing.map((c) => [c.id, c]))
  const changed: CollectionDef[] = []
  for (const col of embedded) {
    const present = byId.get(col.id)
    if (!present) {
      changed.push(col)
      continue
    }
    const missing: RequestDef[] = flattenRequests(col.root)
      .map(({ request }) => request)
      .filter((request) => !findRequest(present.root, request.id))
    if (missing.length === 0) continue
    changed.push({
      ...present,
      root: { ...present.root, requests: [...present.root.requests, ...missing] },
    })
  }
  return changed
}
