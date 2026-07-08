<script lang="ts">
  // Credentials tab body (plan 04 K2): metadata cards with Rotate / Edit /
  // Delete. Values never render — the card shows a fixed mask, and delete
  // uses a two-step confirm that warns about nodes referencing the name.
  import { injectionPreview, SECRET_MASK } from '../../credentials'
  import { dialogs } from '../../dialogs.svelte'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'

  /** Name of the credential whose delete is armed; second click deletes. */
  let confirmingDelete = $state<string | null>(null)

  function deleteCredential(name: string) {
    if (confirmingDelete !== name) {
      confirmingDelete = name
      return
    }
    confirmingDelete = null
    void app.deleteCredential(name)
  }
</script>

<div class="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
  {#each app.credentials as cred (cred.name)}
    <div class="group rounded-md border border-zinc-800 bg-zinc-900/60 p-2">
      <div class="flex items-center justify-between gap-1">
        <p class="truncate text-xs font-medium text-zinc-200">{cred.name}</p>
        <span class="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{cred.kind}</span>
      </div>
      <p class="truncate pt-1 font-mono text-[11px] text-zinc-500" title={injectionPreview(cred)}>
        {injectionPreview(cred)}
      </p>
      <p class="pt-0.5 font-mono text-[11px] tracking-widest text-zinc-600">{SECRET_MASK}</p>
      <div class="flex items-center gap-1 pt-1.5">
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          onclick={() => (dialogs.credential = { mode: 'rotate', name: cred.name })}
        >
          <Icon name="autorenew" size={12} />
          Rotate
        </button>
        <button
          class="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
          onclick={() => (dialogs.credential = { mode: 'edit', name: cred.name })}
        >
          <Icon name="edit" size={12} />
          Edit
        </button>
        <button
          class="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] {confirmingDelete === cred.name
            ? 'bg-red-950 text-red-400'
            : 'text-zinc-500 hover:bg-zinc-800 hover:text-red-400'}"
          onclick={() => deleteCredential(cred.name)}
          onmouseleave={() => {
            if (confirmingDelete === cred.name) confirmingDelete = null
          }}
        >
          <Icon name="delete" size={12} />
          {#if confirmingDelete === cred.name}
            {@const refs = app.credentialNodeRefCount(cred.name)}
            {refs > 0 ? `Really? ${refs === 1 ? '1 node uses' : `${refs} nodes use`} it` : 'Really delete?'}
          {:else}
            Delete
          {/if}
        </button>
      </div>
    </div>
  {:else}
    <p class="p-1 text-center text-[11px] leading-relaxed text-zinc-600">
      No credentials in <em>{app.projectName}</em> yet.
    </p>
  {/each}
  <button
    class="flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-zinc-700 py-1.5 text-xs text-zinc-500 hover:text-zinc-300"
    onclick={() => (dialogs.credential = { mode: 'create' })}
  >
    <Icon name="add" size={14} />
    Add credential
  </button>
  <p class="px-1 text-[10px] leading-relaxed text-zinc-600">
    Values are write-only after saving and stored in the OS keychain — never in project files.
  </p>
</div>
