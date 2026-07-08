// Credential CRUD flows (plan 04 K2), kept out of state.svelte.ts the same
// way library.ts holds the collection flows. AppState wraps the mutating
// ones; rotate touches no frontend state, so the dialog calls it directly.
import { api } from './api'
import type { CredentialDef } from './model'
import type { AppState } from './state.svelte'

/**
 * Create or update a credential's metadata, then store its secret when one
 * was entered (create/rotate — edit passes none). Returns a user-facing
 * error message, or null on success. Metadata and value travel separately:
 * the list never contains a secret.
 */
export async function saveCredential(
  app: AppState,
  def: CredentialDef,
  secret?: string,
): Promise<string | null> {
  const projectId = app.projectId
  if (!app.project || !projectId) return 'no project open'
  const previous = app.project.credentials
  const next = previous.some((c) => c.name === def.name)
    ? previous.map((c) => (c.name === def.name ? def : c))
    : [...previous, def]
  app.project.credentials = next
  try {
    await api.saveCredentials(projectId, $state.snapshot(next) as CredentialDef[])
    if (secret) await api.setCredentialSecret(projectId, def.name, secret)
    return null
  } catch (err) {
    app.project.credentials = previous
    return String(err)
  }
}

/** Re-enter a credential's value (Rotate). Returns an error message or null. */
export async function rotateCredentialSecret(
  projectId: string | null,
  name: string,
  value: string,
): Promise<string | null> {
  if (!projectId) return 'no project open'
  try {
    await api.setCredentialSecret(projectId, name, value)
    return null
  } catch (err) {
    return String(err)
  }
}

/** Delete a credential's metadata and stored secret. */
export async function deleteCredential(app: AppState, name: string): Promise<void> {
  const projectId = app.projectId
  if (!app.project || !projectId) return
  app.project.credentials = app.project.credentials.filter((c) => c.name !== name)
  try {
    await api.deleteCredential(projectId, name)
  } catch (err) {
    console.error('credential delete failed:', err)
  }
}
