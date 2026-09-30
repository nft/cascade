// Credential form helpers: injection preview and draft
// validation, mirroring the Go-side rules (core/httpcall + store) so bad
// metadata is caught before it round-trips to a rejected save.
import type { BoardNodeJSON } from './model'
import { CREDENTIAL_KINDS, type CredentialDef, type CredentialKind } from './model'

/** Stands in for the secret everywhere the UI renders one. */
export const SECRET_MASK = '••••••'

/** The single allowed placeholder in a value template (mirrors httpcall). */
export const SECRET_PLACEHOLDER = '{secret}'

const AUTHORIZATION_HEADER = 'Authorization'
const BEARER_PREFIX = 'Bearer'
const BASIC_PREFIX = 'Basic'

/** Human labels for the kind selector and kind-grouped dropdowns. */
export const CREDENTIAL_KIND_LABELS: Record<CredentialKind, string> = {
  bearer: 'Bearer token',
  basic: 'Basic auth',
  header: 'Custom header',
  query: 'Query parameter',
}

/** Editable credential fields; identity (name) and createdAt are handled by the caller. */
export interface CredentialDraft {
  name: string
  kind: CredentialKind
  header: string
  param: string
  template: string
  username: string
}

export function draftFromCredential(def: CredentialDef): CredentialDraft {
  return {
    name: def.name,
    kind: def.kind,
    header: def.header ?? '',
    param: def.param ?? '',
    template: def.template ?? '',
    username: def.username ?? '',
  }
}

/** Collapse a draft back to metadata: blank optionals are omitted, not stored as "". */
export function credentialFromDraft(draft: CredentialDraft, createdAt: string): CredentialDef {
  return {
    name: draft.name.trim(),
    kind: draft.kind,
    ...(draft.header.trim() !== '' ? { header: draft.header.trim() } : {}),
    ...(draft.param.trim() !== '' ? { param: draft.param.trim() } : {}),
    ...(draft.template.trim() !== '' ? { template: draft.template.trim() } : {}),
    ...(draft.username.trim() !== '' ? { username: draft.username.trim() } : {}),
    createdAt,
  }
}

function applyTemplate(template: string | undefined): string {
  const t = template?.trim() || SECRET_PLACEHOLDER
  return t.replace(SECRET_PLACEHOLDER, SECRET_MASK)
}

/**
 * One-line preview of what the credential injects, with the secret masked —
 * e.g. `X-Internal-Token: Token ••••••`. Mirrors the Go injection matrix.
 */
export function injectionPreview(def: Pick<CredentialDef, 'kind' | 'header' | 'param' | 'template' | 'username'>): string {
  switch (def.kind) {
    case 'bearer':
      return `${AUTHORIZATION_HEADER}: ${BEARER_PREFIX} ${SECRET_MASK}`
    case 'basic':
      return `${AUTHORIZATION_HEADER}: ${BASIC_PREFIX} base64(${def.username ?? ''}:${SECRET_MASK})`
    case 'header':
      return `${def.header || '<header>'}: ${applyTemplate(def.template)}`
    case 'query':
      return `?${def.param || '<param>'}=${applyTemplate(def.template)}`
  }
}

/**
 * Validate a draft before save; returns a user-facing error message or null.
 * `takenNames` are the other credentials' names (exclude the one being edited).
 */
export function validateCredentialDraft(draft: CredentialDraft, takenNames: ReadonlySet<string>): string | null {
  const name = draft.name.trim()
  if (name === '') return 'name is required'
  if (takenNames.has(name)) return `a credential named "${name}" already exists`
  if (!CREDENTIAL_KINDS.includes(draft.kind)) return `unknown kind "${draft.kind}"`
  if (draft.kind === 'header' && draft.header.trim() === '') return 'header kind needs a header name'
  if (draft.kind === 'query' && draft.param.trim() === '') return 'query kind needs a parameter name'
  const template = draft.template.trim()
  if (template !== '' && template.split(SECRET_PLACEHOLDER).length !== 2) {
    return `template must contain the ${SECRET_PLACEHOLDER} placeholder exactly once`
  }
  return null
}

/** Credentials bucketed by kind in CREDENTIAL_KINDS order; empty kinds are omitted. */
export function groupCredentialsByKind(
  credentials: readonly CredentialDef[],
): Array<[CredentialKind, CredentialDef[]]> {
  return CREDENTIAL_KINDS.map(
    (kind): [CredentialKind, CredentialDef[]] => [kind, credentials.filter((c) => c.kind === kind)],
  ).filter(([, group]) => group.length > 0)
}

/**
 * True when `name` references a credential that no longer exists
 * — e.g. it was deleted after nodes were pointed at it. Such references must
 * surface as warnings, never silently fall back to unauthenticated.
 */
export function isDanglingCredential(
  credentials: readonly CredentialDef[],
  name: string | undefined,
): boolean {
  return !!name && !credentials.some((c) => c.name === name)
}

/** Count nodes whose credential setting references `name` (delete confirm). */
export function credentialRefCount(
  nodes: readonly Pick<BoardNodeJSON, 'data'>[],
  name: string,
): number {
  return nodes.filter((n) => n.data?.credential === name).length
}
