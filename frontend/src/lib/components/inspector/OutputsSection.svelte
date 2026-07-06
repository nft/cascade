<script lang="ts">
  import type { NodeExport, RunnableNode } from '../../model'
  import { nodeSchemaSource } from '../../picker'
  import { isValidKey } from '../../refs'
  import { inferSchema, schemaTree } from '../../schema'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import SchemaTree from './SchemaTree.svelte'

  let { node }: { node: RunnableNode } = $props()

  const exports = $derived(node.data.exports ?? [])
  const schemaSource = $derived(nodeSchemaSource(node, app.responses[node.id], inferSchema))

  let newKey = $state('')
  let newPath = $state('')
  /** Export key whose path is being picked from the response tree; null = closed. */
  let pickingFor = $state<string | null>(null)

  const newKeyTaken = $derived(exports.some((e) => e.key === newKey.trim()))
  const canAdd = $derived(isValidKey(newKey.trim()) && !newKeyTaken && newPath.trim() !== '')

  function addExport() {
    if (!canAdd) return
    app.setExports(node.id, [...exports, { key: newKey.trim(), path: newPath.trim() }])
    newKey = ''
    newPath = ''
  }

  function updatePath(key: string, path: string) {
    app.setExports(
      node.id,
      exports.map((e): NodeExport => (e.key === key ? { ...e, path } : e)),
    )
  }

  function removeExport(key: string) {
    app.setExports(node.id, exports.filter((e) => e.key !== key))
  }

  function pick(path: string) {
    if (pickingFor === '') newPath = path
    else if (pickingFor !== null) updatePath(pickingFor, path)
    pickingFor = null
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Outputs</span>
    <span class="text-[10px] text-zinc-600">named exports for downstream nodes</span>
  </div>
  <div class="mt-1.5 space-y-1.5">
    {#each exports as exp (exp.key)}
      <div class="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
        <span class="shrink-0 font-mono text-[11px] text-violet-300">{exp.key}</span>
        <Icon name="arrow_left_alt" size={12} class="shrink-0 text-zinc-600" />
        <input
          class="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 font-mono text-[10px] text-zinc-300 outline-none focus:border-zinc-500"
          value={exp.path}
          oninput={(e) => updatePath(exp.key, e.currentTarget.value)}
        />
        {#if schemaSource}
          <button
            class="flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-zinc-800 {pickingFor === exp.key
              ? 'text-violet-300'
              : 'text-zinc-500 hover:text-zinc-200'}"
            onclick={() => (pickingFor = pickingFor === exp.key ? null : exp.key)}
            title="Pick path from response schema"
            aria-label="Pick path for export {exp.key}"
          >
            <Icon name="account_tree" size={13} />
          </button>
        {/if}
        <button
          class="flex shrink-0 items-center rounded px-1 py-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-rose-400"
          onclick={() => removeExport(exp.key)}
          title="Remove export"
          aria-label="Remove export {exp.key}"
        >
          <Icon name="close" size={12} />
        </button>
      </div>
    {/each}
    <div class="flex items-center gap-1">
      <input
        class="w-20 shrink-0 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder="userId"
        bind:value={newKey}
      />
      <Icon name="arrow_left_alt" size={12} class="shrink-0 text-zinc-600" />
      <input
        class="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 py-1 font-mono text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder="body.data.id"
        bind:value={newPath}
        onkeydown={(e) => {
          if (e.key === 'Enter') addExport()
        }}
      />
      {#if schemaSource}
        <button
          class="flex shrink-0 items-center rounded px-1 py-0.5 hover:bg-zinc-800 {pickingFor === ''
            ? 'text-violet-300'
            : 'text-zinc-500 hover:text-zinc-200'}"
          onclick={() => (pickingFor = pickingFor === '' ? null : '')}
          title="Pick path from response schema"
          aria-label="Pick path for new export"
        >
          <Icon name="account_tree" size={13} />
        </button>
      {/if}
      <button
        class="flex shrink-0 items-center rounded-md border border-zinc-800 px-1.5 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 disabled:cursor-not-allowed disabled:text-zinc-700"
        disabled={!canAdd}
        onclick={addExport}
        title="Add export"
        aria-label="Add export"
      >
        <Icon name="add" size={13} />
      </button>
    </div>
    {#if newKey.trim() !== '' && !isValidKey(newKey.trim())}
      <p class="text-[10px] text-rose-400">export keys are letters, digits and _, starting with a letter</p>
    {:else if newKeyTaken}
      <p class="text-[10px] text-rose-400">an export named "{newKey.trim()}" already exists</p>
    {/if}
    {#if pickingFor !== null && schemaSource}
      <div class="rounded-md border border-violet-500/30 bg-zinc-950 p-1.5">
        <p class="px-1 pb-1 text-[9px] tracking-wide text-zinc-600 uppercase">{schemaSource.label}</p>
        <SchemaTree node={schemaTree(schemaSource.schema)} onPick={pick} />
      </div>
    {/if}
  </div>
</div>
