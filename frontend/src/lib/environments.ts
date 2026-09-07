// Environment helpers (plan 11 W7), mirroring credentials.ts for the other
// half of a node's target. Everything here is pure — the flows that write
// live in environmentActions.svelte.ts.
import type { BoardNodeJSON, EnvironmentDef, OperationNodeData, ProjectDefaults } from './model'
import { isAbsoluteUrl, normalizeOrigin } from './request'

/**
 * Edit-time twins of nodespec's run-time target errors
 * (`core/nodespec/httpbuild.go` noTargetMessage / unknownEnvFormat), worded
 * identically on purpose: one failure met at two moments should not read as
 * two different problems. The engine stays the backstop — these only let the
 * inspector say it before the run does.
 */
export const NO_TARGET_MESSAGE =
  'node has no target — pick an environment or set an origin override'

export function unknownEnvironmentMessage(name: string): string {
  return `node targets environment "${name}", which has no base URL — pick an environment or set an origin override`
}

/** Editable environment fields; both are also its stored shape. */
export interface EnvironmentDraft {
  name: string
  baseUrl: string
}

/**
 * Validate a draft before save; returns a user-facing error message or null.
 * `takenNames` are the other environments' names (exclude the one being
 * edited). A name collision is not cosmetic: the sidebar and the environment
 * select key their rows by name, and nodes reference environments by it.
 */
export function validateEnvironmentDraft(
  draft: EnvironmentDraft,
  takenNames: ReadonlySet<string>,
): string | null {
  const name = draft.name.trim()
  if (name === '') return 'name is required'
  if (takenNames.has(name)) return `an environment named "${name}" already exists`
  if (draft.baseUrl.trim() === '') return 'base URL is required'
  if (normalizeOrigin(draft.baseUrl) === null) {
    return 'base URL must be absolute, e.g. https://api.example.com'
  }
  return null
}

/**
 * Collapse a validated draft to the stored shape. The base URL keeps any path
 * prefix (`https://api.example.com/v1`) — node paths are joined onto it — and
 * loses only its trailing slashes, which joinUrl would otherwise double.
 */
export function environmentFromDraft(draft: EnvironmentDraft): EnvironmentDef {
  return {
    name: draft.name.trim(),
    baseUrl: normalizeOrigin(draft.baseUrl) ?? draft.baseUrl.trim(),
  }
}

/**
 * True when `name` references an environment that no longer exists — the same
 * hazard isDanglingCredential covers, and the more damaging half: a node
 * pointed at a deleted environment has no base URL at all, so the run fails
 * before it reaches the network.
 */
export function isDanglingEnvironment(
  environments: readonly EnvironmentDef[],
  name: string | undefined,
): boolean {
  return !!name && !environments.some((e) => e.name === name)
}

/** Count nodes whose environment setting references `name` (delete confirm). */
export function environmentRefCount(
  nodes: readonly Pick<BoardNodeJSON, 'data'>[],
  name: string,
): number {
  return nodes.filter((n) => n.data?.environment === name).length
}

/**
 * The project defaults that go with `environments` — one rule covering three
 * moments, because they are the same moment: the default must name an
 * environment that exists.
 *
 * Adding the first environment claims an empty default, so nodes created next
 * are born with a target. Deleting the default hands it to whatever remains
 * rather than clearing it, which would silently return the project to the
 * state W7 exists to fix. Deleting the last one does clear it — there is
 * nothing left to point at. `preferred` is the explicit "Set default" pick.
 *
 * The credential half is carried through untouched: it is the credentials
 * tab's to manage, and nothing here knows whether it still resolves.
 */
export function nextDefaults(
  current: ProjectDefaults | undefined,
  environments: readonly EnvironmentDef[],
  preferred?: string,
): ProjectDefaults {
  const names = new Set(environments.map((e) => e.name))
  const keep = (name: string | undefined) => (name && names.has(name) ? name : undefined)
  const environment = keep(preferred) ?? keep(current?.environment) ?? environments[0]?.name ?? ''
  return { ...current, environment }
}

/**
 * Why the node cannot be sent, or null when it has a target — the edit-time
 * mirror of HTTPSpec.BuildRequest's resolution order, which is why the two
 * escape hatches are checked first: an absolute URL typed into the path
 * carries its own origin, and an origin override beats the environment. A
 * node using either never touches environment resolution, so warning about
 * its environment would be a false alarm.
 */
export function targetProblem(
  environments: readonly EnvironmentDef[],
  data: Pick<OperationNodeData, 'path' | 'origin' | 'environment'>,
): string | null {
  if (isAbsoluteUrl(data.path ?? '')) return null
  if ((data.origin ?? '').trim() !== '') return null
  const name = (data.environment ?? '').trim()
  if (name === '') return NO_TARGET_MESSAGE
  const baseUrl = environments.find((e) => e.name === name)?.baseUrl ?? ''
  return baseUrl.trim() === '' ? unknownEnvironmentMessage(name) : null
}
