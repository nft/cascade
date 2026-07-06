<script lang="ts">
  import { ancestorNodes, nodeSchemaSource } from '../../picker'
  import { app } from '../../state.svelte'
  import { inferSchema, schemaTree } from '../../schema'
  import Icon from '../Icon.svelte'
  import SchemaTree from './SchemaTree.svelte'

  let {
    nodeId,
    onInsert,
  }: {
    /** The node whose field is being edited (references go to its ancestors). */
    nodeId: string
    /** Called with the `{{…}}` text to insert at the field's cursor. */
    onInsert: (text: string) => void
  } = $props()

  const ancestors = $derived(ancestorNodes(app.nodes, app.edges, nodeId))

  /** Free-text path per ancestor when it has no schema tree to offer. */
  let freePaths = $state<Record<string, string>>({})

  function insertRef(nodeKey: string, path: string) {
    onInsert(`{{${nodeKey}${path === '' ? '' : path.startsWith('[') ? path : `.${path}`}}}`)
  }
</script>

<div
  data-testid="binding-picker"
  class="mt-1 max-h-72 space-y-2 overflow-y-auto rounded-md border border-violet-500/30 bg-zinc-950 p-2"
>
  {#if ancestors.length === 0}
    <p class="px-1 py-2 text-center text-[11px] text-zinc-600">
      Connect an upstream node to reference its output.
    </p>
  {/if}
  {#each ancestors as { node, direct } (node.id)}
    {@const source = nodeSchemaSource(node, app.responses[node.id], inferSchema)}
    <section>
      <header class="flex items-center gap-1.5 px-1 pb-1">
        <span class="font-mono text-[11px] font-semibold text-violet-300">{node.data.key}</span>
        <span class="truncate text-[10px] text-zinc-500">{node.data.name}</span>
        {#if direct}
          <span class="ml-auto shrink-0 rounded bg-zinc-800 px-1 py-0.5 text-[9px] text-zinc-400">direct · res</span>
        {/if}
      </header>

      {#if (node.data.exports ?? []).length > 0}
        <div class="flex flex-wrap gap-1 px-1 pb-1">
          {#each node.data.exports ?? [] as exp (exp.key)}
            <button
              class="inline-flex items-center gap-1 rounded bg-violet-500/15 px-1.5 py-0.5 font-mono text-[10px] text-violet-300 hover:bg-violet-500/30"
              onclick={() => insertRef(node.data.key, exp.key)}
              title="Export: {exp.path}"
            >
              <Icon name="output" size={11} />
              {exp.key}
            </button>
          {/each}
        </div>
      {/if}

      <div class="flex flex-wrap gap-1 px-1 pb-1">
        <button
          class="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-700"
          onclick={() => insertRef(node.data.key, 'status')}>status</button
        >
        <button
          class="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-700"
          onclick={() => insertRef(node.data.key, 'headers')}>headers</button
        >
        <button
          class="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 hover:bg-zinc-700"
          onclick={() => insertRef(node.data.key, 'body')}>body</button
        >
      </div>

      {#if source}
        <p class="px-1 pb-0.5 text-[9px] tracking-wide text-zinc-600 uppercase">{source.label}</p>
        <SchemaTree node={schemaTree(source.schema)} onPick={(path) => insertRef(node.data.key, path)} />
      {:else}
        <div class="flex items-center gap-1 px-1">
          <input
            class="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-[10px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
            placeholder="body.path.to.value — no schema yet; run the node once"
            bind:value={freePaths[node.id]}
            onkeydown={(e) => {
              if (e.key === 'Enter' && (freePaths[node.id] ?? '') !== '') insertRef(node.data.key, freePaths[node.id])
            }}
          />
          <button
            class="flex items-center rounded px-1 py-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700"
            disabled={(freePaths[node.id] ?? '') === ''}
            onclick={() => insertRef(node.data.key, freePaths[node.id])}
            title="Insert path reference"
            aria-label="Insert path reference"
          >
            <Icon name="keyboard_return" size={13} />
          </button>
        </div>
      {/if}
    </section>
  {/each}
</div>
