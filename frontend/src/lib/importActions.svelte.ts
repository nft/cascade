// Post-import flows, shared by clipboard paste and file
// import: merge envelope-embedded collections into the library, then open
// the requires-mapping wizard for whatever didn't auto-match by name. Pure
// logic lives in importMapping.ts; this module owns the state/API side.
import { api } from './api'
import { dialogs } from './dialogs.svelte'
import {
  mergeCollections,
  placeholderCredential,
  placeholderEnvironment,
  renameNodeTargets,
  unmatchedRequirements,
  type RequirementResolution,
  type RequirementRow,
  type TargetRename,
} from './importMapping'
import type { CollectionDef, CredentialDef, EnvelopeRequires, EnvironmentDef } from './model'
import type { AppState } from './state.svelte'

/**
 * Runs after nodes from an envelope landed (pasted onto the canvas, or an
 * imported board was opened): merges embedded collections, then — when some
 * requires have no exact-name match — opens the mapping wizard over the
 * affected node IDs. Zero-dialog when everything matched.
 */
export async function finishEnvelopeImport(
  app: AppState,
  requires: EnvelopeRequires | undefined,
  collections: CollectionDef[] | undefined,
  nodeIds: string[],
): Promise<void> {
  const rows = unmatchedRequirements(requires, app.environments, app.credentials)
  if (rows.length > 0) dialogs.importMapping = { rows, nodeIds }
  await mergeEmbeddedCollections(app, collections)
}

/**
 * Applies the wizard's row resolutions: placeholders are created carrying the
 * required names (a placeholder credential has no value — runs error with an
 * actionable message until one is entered via Rotate), map-to-existing
 * rewrites the imported nodes' references, skipped rows change nothing (the
 * dangling-credential badges keep flagging them). Returns a user-facing error
 * message, or null on success.
 */
export async function applyImportMappings(
  app: AppState,
  rows: readonly RequirementRow[],
  resolutions: readonly RequirementResolution[],
  nodeIds: readonly string[],
): Promise<string | null> {
  const projectId = app.projectId
  if (!app.project || !projectId) return 'no project open'

  const envCreates: EnvironmentDef[] = []
  const credCreates: CredentialDef[] = []
  const renames: TargetRename[] = []
  rows.forEach((row, i) => {
    const resolution = resolutions[i] ?? { action: 'skip' }
    if (resolution.action === 'create') {
      if (row.type === 'environment') envCreates.push(placeholderEnvironment(row.name))
      else credCreates.push(placeholderCredential(row.name, row.kind, new Date().toISOString()))
    } else if (resolution.action === 'existing') {
      renames.push({ type: row.type, from: row.name, to: resolution.target })
    }
  })

  const previousEnvs = app.project.environments
  const previousCreds = app.project.credentials
  if (envCreates.length > 0) app.project.environments = [...previousEnvs, ...envCreates]
  if (credCreates.length > 0) app.project.credentials = [...previousCreds, ...credCreates]
  try {
    if (envCreates.length > 0) {
      await api.saveEnvironments(projectId, $state.snapshot(app.project.environments))
    }
    if (credCreates.length > 0) {
      await api.saveCredentials(
        projectId,
        $state.snapshot(app.project.credentials) as CredentialDef[],
      )
    }
  } catch (err) {
    app.project.environments = previousEnvs
    app.project.credentials = previousCreds
    return String(err)
  }

  if (renames.length > 0) {
    app.nodes = renameNodeTargets(app.nodes, new Set(nodeIds), renames)
    app.scheduleBoardSave()
  }
  return null
}

/**
 * Saves the merge of embedded collections into the library. Failures follow
 * the board-save policy (logged, never blocking): the imported nodes run
 * standalone regardless — requestRef is provenance, not a dependency.
 */
async function mergeEmbeddedCollections(
  app: AppState,
  embedded: CollectionDef[] | undefined,
): Promise<void> {
  const projectId = app.projectId
  if (!app.project || !projectId) return
  const changed = mergeCollections($state.snapshot(app.project.collections) as CollectionDef[], embedded)
  for (const collection of changed) {
    try {
      await api.saveCollection(projectId, collection)
      const known = app.project.collections.some((c) => c.id === collection.id)
      app.project.collections = known
        ? app.project.collections.map((c) => (c.id === collection.id ? collection : c))
        : [...app.project.collections, collection]
    } catch (err) {
      console.error('collection merge failed:', err)
    }
  }
}
