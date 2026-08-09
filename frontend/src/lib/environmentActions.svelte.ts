// Environment CRUD flows (plan 11 W7), kept out of state.svelte.ts the same
// way credentialActions.svelte.ts holds the credential ones — and, unlike
// those, not re-exported as AppState methods: that file is already at the
// 600-line limit, so components call these directly, exactly as
// CredentialDialog already calls rotateCredentialSecret.
import { api } from './api'
import { environmentRefCount, nextDefaults } from './environments'
import type { EnvironmentDef, ProjectDefaults } from './model'
import type { AppState } from './state.svelte'

const NO_PROJECT = 'no project open'

/** Create or replace one environment — names are immutable, so this upserts by name. */
export async function saveEnvironment(app: AppState, def: EnvironmentDef): Promise<string | null> {
  const list = app.environments
  const next = list.some((e) => e.name === def.name)
    ? list.map((e) => (e.name === def.name ? def : e))
    : [...list, def]
  return persist(app, next)
}

/** Delete one environment; the project default moves off it in the same action. */
export async function deleteEnvironment(app: AppState, name: string): Promise<string | null> {
  return persist(
    app,
    app.environments.filter((e) => e.name !== name),
  )
}

/** Point the project default at `name`, so the next node added targets it. */
export async function setDefaultEnvironment(app: AppState, name: string): Promise<string | null> {
  return persist(app, app.environments, name)
}

/** Nodes across every board of the project that target `name`. */
export function environmentNodeRefCount(app: AppState, name: string): number {
  return environmentRefCount(app.allNodeData(), name)
}

/**
 * Write the list and the defaults it implies, rolling both back together when
 * either write fails.
 *
 * Two round trips, in this order deliberately. If the second fails, disk holds
 * the new list beside a default that may name an environment no longer in it —
 * which the environment select renders as an explicit "(deleted)" row. The
 * other order would leave a default naming an environment the list never
 * gained, which nothing surfaces at all.
 */
async function persist(
  app: AppState,
  environments: EnvironmentDef[],
  preferred?: string,
): Promise<string | null> {
  const projectId = app.projectId
  if (!app.project || !projectId) return NO_PROJECT
  const previousEnvironments = app.project.environments
  const previousDefaults = app.project.project.defaults
  const defaults = nextDefaults(previousDefaults, environments, preferred)
  app.project.environments = environments
  app.project.project.defaults = defaults
  try {
    await api.saveEnvironments(projectId, $state.snapshot(environments) as EnvironmentDef[])
    await api.setProjectDefaults(projectId, $state.snapshot(defaults) as ProjectDefaults)
    return null
  } catch (err) {
    app.project.environments = previousEnvironments
    app.project.project.defaults = previousDefaults
    return String(err)
  }
}
