<script lang="ts">
  // Shared option list for credential selects (plan 04 K5): a first-class
  // None entry, credentials grouped by kind, and — when the current value
  // references a deleted credential — that name kept visible as a disabled
  // entry, so the select never displays None over stale data.
  import {
    CREDENTIAL_KIND_LABELS,
    groupCredentialsByKind,
    isDanglingCredential,
  } from '../credentials'
  import { app } from '../state.svelte'

  let { current = '' }: { current?: string } = $props()

  const groups = $derived(groupCredentialsByKind(app.credentials))
  const dangling = $derived(isDanglingCredential(app.credentials, current))
</script>

<option value="">None</option>
{#if dangling}
  <option value={current} disabled>{current} (deleted)</option>
{/if}
{#each groups as [kind, creds] (kind)}
  <optgroup label={CREDENTIAL_KIND_LABELS[kind]}>
    {#each creds as cred (cred.name)}
      <option value={cred.name}>{cred.name}</option>
    {/each}
  </optgroup>
{/each}
