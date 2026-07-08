<script lang="ts">
  import { isHttpNode, isRunnableNode } from '../model'
  import { app } from '../state.svelte'
  import { methodBadge } from '../ui'
  import Icon from './Icon.svelte'
  import NameKeySection from './inspector/NameKeySection.svelte'
  import OutputsSection from './inspector/OutputsSection.svelte'
  import RequestSection from './inspector/RequestSection.svelte'
  import RequestTargetSection from './inspector/RequestTargetSection.svelte'
  import ResponseSchemaSection from './inspector/ResponseSchemaSection.svelte'
  import TransformSection from './inspector/TransformSection.svelte'

  // http and transform nodes get an inspector; notes edit inline on the card.
  const node = $derived(
    app.selectedNode && isRunnableNode(app.selectedNode) ? app.selectedNode : null,
  )
</script>

{#if node}
  <aside class="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-zinc-800 bg-surface">
    <div class="flex items-center gap-2 border-b border-zinc-800 px-3 py-2.5">
      {#if isHttpNode(node)}
        <span class="rounded px-1.5 py-0.5 text-[10px] font-semibold {methodBadge[node.data.method]}">{node.data.method}</span>
        <span class="truncate font-mono text-[11px] text-zinc-400">{node.data.path}</span>
      {:else}
        <span class="flex items-center rounded bg-violet-500/15 px-1 py-0.5 text-violet-300">
          <Icon name="function" size={13} />
        </span>
        <span class="truncate font-mono text-[11px] text-zinc-400">transform step</span>
      {/if}
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
      <NameKeySection {node} />

      {#if isHttpNode(node)}
        <RequestTargetSection {node} />

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
              <option value="">none</option>
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

        <RequestSection {node} />

        <OutputsSection {node} />

        <ResponseSchemaSection {node} />
      {:else}
        <TransformSection {node} />

        <OutputsSection {node} />
      {/if}
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
