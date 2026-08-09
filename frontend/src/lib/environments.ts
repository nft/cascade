// Environment helpers (plan 11 W7), mirroring credentials.ts for the other
// half of a node's target. Everything here is pure — the flows that write
// live in environmentActions.svelte.ts.
import type { BoardNodeJSON, EnvironmentDef, ProjectDefaults } from './model'

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
