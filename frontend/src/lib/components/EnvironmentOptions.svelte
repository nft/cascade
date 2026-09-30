<script lang="ts">
  // Shared option list for environment selects, the twin of
  // CredentialOptions: a first-class None entry, the project's environments,
  // and — when the current value names a deleted one — that name kept visible
  // as a disabled entry, so the select never displays None over stale data.
  //
  // The empty list gets a row of its own. A project the user created has no
  // environments at all, and a dropdown holding only None explains neither
  // why the node has nowhere to call nor where to fix it.
  import { isDanglingEnvironment } from '../environments'
  import { app } from '../state.svelte'

  let { current = '' }: { current?: string } = $props()

  const dangling = $derived(isDanglingEnvironment(app.environments, current))
</script>

<option value="">None</option>
{#if dangling}
  <option value={current} disabled>{current} (deleted)</option>
{/if}
{#each app.environments as env (env.name)}
  <option value={env.name}>{env.name}</option>
{:else}
  <option disabled>No environments — add one in the sidebar</option>
{/each}
