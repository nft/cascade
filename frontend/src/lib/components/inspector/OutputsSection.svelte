<script lang="ts">
  import type { NodeExport, RunnableNode } from '../../model'
  import { nodeSchemaSource } from '../../picker'
  import { isValidKey } from '../../refs'
  import { inferSchema, schemaTree } from '../../schema'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'
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
    <span class={FIELD_LABEL}>Outputs</span>
    <span class="text-[10px] text-zinc-600">named exports for downstream nodes</span>
  </div>
  <div class="mt-1.5 space-y-1.5">
    {#each exports as exp (exp.key)}
      <div class="flex items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
        <span class="shrink-0 font-mono text-[11px] text-violet-300">{exp.key}</span>
        <Icon name="arrow_left_alt" size={12} class="shrink-0 text-zinc-600" />
        <Input
          size="2xs"
          mono
          class="min-w-0 flex-1"
          value={exp.path}
          oninput={(e) => updatePath(exp.key, e.currentTarget.value)}
        />
        {#if schemaSource}
          <IconButton
            icon="account_tree"
            iconSize={13}
            tone={pickingFor === exp.key ? 'accent' : 'default'}
            onclick={() => (pickingFor = pickingFor === exp.key ? null : exp.key)}
            title="Pick path from response schema"
            label="Pick path for export {exp.key}"
          />
        {/if}
        <IconButton
          icon="close"
          iconSize={12}
          tone="danger"
          onclick={() => removeExport(exp.key)}
          title="Remove export"
          label="Remove export {exp.key}"
        />
      </div>
    {/each}
    <div class="flex items-center gap-1">
      <Input size="xs" surface="raised" mono class="w-20 shrink-0" placeholder="userId" bind:value={newKey} />
      <Icon name="arrow_left_alt" size={12} class="shrink-0 text-zinc-600" />
      <Input
        size="xs"
        surface="raised"
        mono
        class="min-w-0 flex-1"
        placeholder="body.data.id"
        bind:value={newPath}
        onkeydown={(e) => {
          if (e.key === 'Enter') addExport()
        }}
      />
      {#if schemaSource}
        <IconButton
          icon="account_tree"
          iconSize={13}
          tone={pickingFor === '' ? 'accent' : 'default'}
          onclick={() => (pickingFor = pickingFor === '' ? null : '')}
          title="Pick path from response schema"
          label="Pick path for new export"
        />
      {/if}
      <Button
        variant="secondary"
        size="xs"
        class="shrink-0"
        disabled={!canAdd}
        onclick={addExport}
        title="Add export"
        aria-label="Add export"
      >
        <Icon name="add" size={13} />
      </Button>
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
