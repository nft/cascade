<script lang="ts">
  // The SOURCES half of the requests tree: imported OpenAPI
  // operations, read-only, grouped as before — extracted from Sidebar.svelte.
  import { app } from '../../state.svelte'
  import { methodBadge } from '../../ui'
  import { FIELD_LABEL } from '../ui/classes'

  let { query }: { query: string } = $props()

  const filtered = $derived(
    app.operations.filter((op) =>
      `${op.method} ${op.path} ${op.summary}`.toLowerCase().includes(query.toLowerCase()),
    ),
  )
  const groups = $derived([...new Set(filtered.map((op) => op.group))])
  const sourcesLabel = $derived(
    (app.project?.sources ?? []).map((s) => `${s.title} ${s.version ?? ''}`.trim()).join(', '),
  )
</script>

<p class="px-1 pt-1 pb-0.5 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">Sources</p>
{#if app.operations.length === 0}
  <p class="px-1 pb-2 text-[11px] leading-relaxed text-zinc-600">
    No schemas imported into <em>{app.projectName}</em> yet — use Import schema to add an OpenAPI
    document.
  </p>
{:else}
  <p class="px-1 pb-2 text-[10px] text-zinc-600">{sourcesLabel} · click to add to canvas</p>
  {#each groups as group (group)}
    <p class="px-1 pt-2 pb-1 {FIELD_LABEL}">{group}</p>
    {#each filtered.filter((op) => op.group === group) as op (op.ref)}
      <button
        class="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-zinc-800/70"
        onclick={() => app.addNode(op)}
        title={op.summary}
      >
        <span class="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold {methodBadge[op.method]}">
          {op.method}
        </span>
        <span class="truncate font-mono text-[11px] text-zinc-300">{op.path}</span>
      </button>
    {/each}
  {:else}
    <p class="px-1 py-1 text-[11px] text-zinc-600">No matching operations</p>
  {/each}
{/if}
