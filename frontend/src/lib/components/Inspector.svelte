<script lang="ts">
  import { isHttpNode } from '../model'
  import { app } from '../state.svelte'
  import { methodBadge } from '../ui'
  import Icon from './Icon.svelte'

  // Only the http card has an inspector today; transform/note variants land
  // with plan 06 T5/T6.
  const node = $derived(app.selectedNode && isHttpNode(app.selectedNode) ? app.selectedNode : null)

  let nameInput = $state<HTMLInputElement | null>(null)
  let lastRenameSignal = app.renameSignal
  $effect(() => {
    if (app.renameSignal !== lastRenameSignal) {
      lastRenameSignal = app.renameSignal
      nameInput?.focus()
      nameInput?.select()
    }
  })
</script>

{#if node}
  <aside class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-surface">
    <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
      <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {methodBadge[node.data.method]}">{node.data.method}</span>
      <span class="truncate font-mono text-[11px] text-zinc-400">{node.data.path}</span>
      <button
        class="ml-auto flex items-center rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
        onclick={() => (app.selectedNodeId = null)}
        title="Close inspector"
        aria-label="Close inspector"
      >
        <Icon name="close" size={14} />
      </button>
    </div>

    <div class="flex-1 space-y-4 p-3">
      <label class="block">
        <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Name</span>
        <input
          bind:this={nameInput}
          class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
          value={node.data.name}
          oninput={(e) => app.updateNodeData(node.id, { name: e.currentTarget.value })}
        />
      </label>

      <div class="grid grid-cols-2 gap-2">
        <label class="block">
          <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Environment</span>
          <select
            class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
            value={node.data.environment}
            onchange={(e) => app.updateNodeData(node.id, { environment: e.currentTarget.value })}
          >
            {#each app.environments as env (env.name)}
              <option value={env.name}>{env.name}</option>
            {/each}
          </select>
        </label>
        <label class="block">
          <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Credential</span>
          <select
            class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
            value={node.data.credential}
            onchange={(e) => app.updateNodeData(node.id, { credential: e.currentTarget.value })}
          >
            {#each app.credentials as cred (cred.name)}
              <option value={cred.name}>{cred.name}</option>
            {/each}
          </select>
        </label>
      </div>

      <label class="block">
        <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Repeat</span>
        <input
          type="number"
          min="1"
          class="mt-1 w-24 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-zinc-500"
          value={node.data.repeat}
          oninput={(e) => app.updateNodeData(node.id, { repeat: Math.max(1, Number(e.currentTarget.value) || 1) })}
        />
      </label>

      <div>
        <div class="flex items-center justify-between">
          <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Request fields</span>
          <span class="text-[10px] text-zinc-600">from operation schema</span>
        </div>
        <div class="mt-1.5 space-y-1.5">
          {#each node.data.fields as field (field.key)}
            <div class="rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
              <p class="font-mono text-[11px] text-zinc-400">{field.key}</p>
              {#if field.source === 'binding'}
                <p class="mt-1 inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-300">
                  <Icon name="link" size={12} />
                  {field.value}
                </p>
              {:else}
                <p class="mt-1 font-mono text-[11px] text-zinc-200">{field.value}</p>
              {/if}
            </div>
          {:else}
            <p class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-600">
              No fields configured yet — the schema-driven form lands with the M2 engine wiring.
            </p>
          {/each}
        </div>
      </div>
    </div>

    <div class="mt-auto border-t border-zinc-800 p-3">
      <button
        class="flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-500/30 px-2 py-1.5 text-xs text-rose-400 hover:bg-rose-500/10"
        onclick={() => app.removeNode(node.id)}
        title="Delete node"
      >
        <Icon name="delete" size={14} />
        Delete node
      </button>
    </div>
  </aside>
{/if}
