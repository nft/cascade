<script lang="ts">
  // One editable row of the schema tree: rename, type, format,
  // nullable, delete, add-child. Every edit is a pure schemaEdit op applied
  // to the root via `edit`, so the tree re-renders from the new root.
  import type { SchemaJSON } from '../../model'
  import {
    addPropertyAt,
    removePropertyAt,
    renamePropertyAt,
    SCHEMA_TYPES,
    setFormatAt,
    setNullableAt,
    setTypeAt,
    type SchemaPath,
    type SchemaType,
  } from '../../schemaEdit'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'
  import Select from '../ui/Select.svelte'
  import SchemaEditorNode from './SchemaEditorNode.svelte'

  // Rows expand two levels by default, like the read-only SchemaTree.
  const DEFAULT_OPEN_DEPTH = 2

  let {
    schema,
    label,
    pathLabel,
    path,
    depth = 0,
    fixed = false,
    edit,
  }: {
    schema: SchemaJSON
    /** Display name: a property key, the root label, or '[0]' for items. */
    label: string
    /** Dotted accessor for aria-labels ('body.customer.email'). */
    pathLabel: string
    path: SchemaPath
    depth?: number
    /** Root and items rows can't be renamed or deleted. */
    fixed?: boolean
    edit: (fn: (root: SchemaJSON) => SchemaJSON | null) => void
  } = $props()

  // depth is fixed for a row's lifetime (rows are keyed), so capturing it
  // once for the initial open state is intended — same as SchemaTree.
  // svelte-ignore state_referenced_locally
  let open = $state(depth < DEFAULT_OPEN_DEPTH)
  let adding = $state(false)
  let newKey = $state('')

  /** The single selected type, or '' when the schema has a union/no type. */
  const primaryType = $derived(typeof schema.type === 'string' ? schema.type : '')
  const unionLabel = $derived(Array.isArray(schema.type) ? schema.type.join(' | ') : 'any')
  const isObject = $derived(primaryType === 'object' || schema.properties !== undefined)
  const properties = $derived(Object.entries(schema.properties ?? {}))
  const hasChildren = $derived(properties.length > 0 || schema.items !== undefined)

  function rename(next: string) {
    if (next === label || fixed) return
    edit((root) => renamePropertyAt(root, path.slice(0, -1), label, next))
  }

  function addProperty() {
    const name = newKey.trim()
    if (name === '') return
    edit((root) => addPropertyAt(root, path, name))
    newKey = ''
    adding = false
    open = true
  }
</script>

<div class="min-w-0" style="--indent:{depth * 12}px">
  <div class="group flex items-center gap-1 pl-(--indent)">
    {#if hasChildren}
      <button
        class="flex items-center rounded text-zinc-500 hover:text-zinc-200"
        onclick={() => (open = !open)}
        aria-label={open ? 'Collapse' : 'Expand'}
      >
        <Icon name={open ? 'expand_more' : 'chevron_right'} size={14} />
      </button>
    {:else}
      <span class="w-3.5 shrink-0"></span>
    {/if}

    {#if fixed}
      <span class="shrink-0 font-mono text-[11px] text-zinc-400">{label}</span>
    {:else}
      <!-- Stays raw: reads as plain text until hover/focus reveals the field — a
           different interaction pattern than ui/Input's always-boxed look. -->
      <input
        class="w-0 min-w-16 flex-1 basis-16 rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[11px] text-zinc-300 outline-none hover:border-zinc-800 focus:border-zinc-500 focus:bg-zinc-950"
        value={label}
        aria-label="Rename {pathLabel}"
        onchange={(e) => rename(e.currentTarget.value.trim())}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
    {/if}

    <Select
      size="2xs"
      class="shrink-0"
      value={primaryType}
      aria-label="Type of {pathLabel}"
      onchange={(e) => {
        const type = e.currentTarget.value as SchemaType
        edit((root) => setTypeAt(root, path, type))
      }}
    >
      {#if primaryType === ''}
        <option value="" disabled>{unionLabel}</option>
      {/if}
      {#each SCHEMA_TYPES as type (type)}
        <option value={type}>{type}</option>
      {/each}
    </Select>

    {#if primaryType === 'string'}
      <Input
        size="2xs"
        mono
        class="w-16 shrink-0"
        value={schema.format ?? ''}
        placeholder="format"
        aria-label="Format of {pathLabel}"
        onchange={(e) => {
          const format = e.currentTarget.value
          edit((root) => setFormatAt(root, path, format))
        }}
      />
    {/if}

    <button
      class="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium tracking-wide uppercase {schema.nullable
        ? 'bg-amber-500/15 text-amber-300'
        : 'text-zinc-600 hover:text-zinc-400'}"
      aria-label="Toggle nullable on {pathLabel}"
      aria-pressed={schema.nullable === true}
      title={schema.nullable ? 'Nullable — click to clear' : 'Mark nullable'}
      onclick={() => edit((root) => setNullableAt(root, path, !schema.nullable))}
    >
      null
    </button>

    {#if isObject}
      <IconButton
        icon="add"
        iconSize={13}
        tone="quiet"
        label="Add property to {pathLabel}"
        title="Add property"
        onclick={() => (adding = !adding)}
      />
    {/if}
    {#if !fixed}
      <IconButton
        icon="close"
        iconSize={13}
        tone="quiet-danger"
        label="Delete {pathLabel}"
        title="Delete key"
        onclick={() => edit((root) => removePropertyAt(root, path.slice(0, -1), label))}
      />
    {/if}
  </div>

  {#if adding}
    <div class="mt-1 flex items-center gap-1 pl-(--indent)">
      <span class="w-3.5 shrink-0"></span>
      <!-- The row only exists because the user clicked Add, so stealing focus is the point. -->
      <Input
        size="sm"
        surface="raised"
        mono
        class="min-w-0 flex-1"
        placeholder="new key"
        aria-label="New property name in {pathLabel}"
        autofocus
        bind:value={newKey}
        onkeydown={(e) => {
          if (e.key === 'Enter') addProperty()
          if (e.key === 'Escape') {
            e.stopPropagation()
            adding = false
          }
        }}
      />
      <Button variant="secondary" size="xs" disabled={newKey.trim() === ''} onclick={addProperty}>Add</Button>
    </div>
  {/if}

  {#if open}
    {#each properties as [key, child] (key)}
      <SchemaEditorNode
        schema={child}
        label={key}
        pathLabel="{pathLabel}.{key}"
        path={[...path, { kind: 'prop', key }]}
        depth={depth + 1}
        {edit}
      />
    {/each}
    {#if schema.items}
      <SchemaEditorNode
        schema={schema.items}
        label="[0]"
        pathLabel="{pathLabel}[0]"
        path={[...path, { kind: 'items' }]}
        depth={depth + 1}
        fixed
        {edit}
      />
    {/if}
  {/if}
</div>
