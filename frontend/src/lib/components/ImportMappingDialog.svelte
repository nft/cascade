<script lang="ts">
  // Requires-mapping wizard (plan 07 E4): one row per unmatched environment /
  // credential of a pasted or imported envelope. Default is creating a
  // placeholder with the required name; picking an existing entry rewrites
  // the imported nodes instead; leaving a row unmapped keeps the reference
  // as-is (plan-04 dangling badges flag it). Closing applies nothing.
  import { applyImportMappings } from '../importActions.svelte'
  import type { RequirementResolution } from '../importMapping'
  import { dialogs, type ImportMappingContext } from '../dialogs.svelte'
  import { app } from '../state.svelte'
  import ModalShell from './library/ModalShell.svelte'
  import Button from './ui/Button.svelte'
  import Field from './ui/Field.svelte'
  import Select from './ui/Select.svelte'

  let { context }: { context: ImportMappingContext } = $props()

  const CREATE = 'create'
  const SKIP = 'skip'
  const EXISTING_PREFIX = 'existing:'

  // The dialog mounts fresh per open, so init-once state is safe.
  // svelte-ignore state_referenced_locally
  let choices = $state<string[]>(context.rows.map(() => CREATE))
  let error = $state<string | null>(null)
  let applying = $state(false)

  const existingNames = (type: 'environment' | 'credential') =>
    type === 'environment' ? app.environments.map((e) => e.name) : app.credentials.map((c) => c.name)

  function toResolution(choice: string): RequirementResolution {
    if (choice === CREATE) return { action: 'create' }
    if (choice.startsWith(EXISTING_PREFIX)) {
      return { action: 'existing', target: choice.slice(EXISTING_PREFIX.length) }
    }
    return { action: 'skip' }
  }

  function close() {
    dialogs.importMapping = null
  }

  async function apply() {
    applying = true
    error = await applyImportMappings(app, context.rows, choices.map(toResolution), context.nodeIds)
    applying = false
    if (error === null) close()
  }
</script>

<ModalShell title="Map imported requirements" onclose={close}>
  <p class="text-xs leading-relaxed text-zinc-400">
    The pasted nodes reference names this project doesn't have yet. Placeholders are created
    without values — enter credentials in the sidebar afterwards.
  </p>
  {#each context.rows as row, i (row.type + row.name)}
    <Field label="{row.type === 'environment' ? 'Environment' : 'Credential'} “{row.name}”{row.kind ? ` (${row.kind})` : ''}">
      <Select bind:value={choices[i]} class="mt-1 w-full">
        <option value={CREATE}>Create placeholder “{row.name}”</option>
        {#each existingNames(row.type) as name (name)}
          <option value="{EXISTING_PREFIX}{name}">Use existing: {name}</option>
        {/each}
        <option value={SKIP}>Leave unmapped</option>
      </Select>
    </Field>
  {/each}
  {#if error}
    <p class="text-xs text-red-400">{error}</p>
  {/if}
  <div class="flex justify-end gap-2">
    <Button variant="secondary" onclick={close}>Skip all</Button>
    <Button variant="primary" onclick={apply} disabled={applying}>Apply</Button>
  </div>
</ModalShell>
