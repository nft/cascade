<script lang="ts">
  import {
    methodAllowsBody,
    paramRows,
    sectionFields,
    sectionKey,
    type RequestSectionId,
  } from '../../request'
  import type { RequestEditorTarget } from '../../requestEditor'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import Input from '../ui/Input.svelte'
  import FieldRow from './FieldRow.svelte'
  import RawBodyEditor from './RawBodyEditor.svelte'

  // Renders over the adapter, not an HttpNode (plan 08 B3), so the request
  // editor dialog reuses the exact same sections over a library draft.
  let { target }: { target: RequestEditorTarget } = $props()

  // The active tab is derived: an explicit user pick wins while it stays
  // valid (same target, tab still shown); otherwise the first section with
  // rows — a POST with only body fields must not greet with empty Params.
  let picked = $state<{ targetId: string; tab: RequestSectionId } | null>(null)
  let newName = $state('')

  const params = $derived(paramRows(target.fields, target.path))
  const headers = $derived(sectionFields(target.fields, 'headers'))
  const body = $derived(sectionFields(target.fields, 'body'))
  const allowsBody = $derived(methodAllowsBody(target.method))
  const supportsRaw = $derived(target.setRawBody !== undefined)
  const rawMode = $derived(target.rawBody !== undefined)

  const defaultTab = $derived<RequestSectionId>(
    params.length > 0
      ? 'params'
      : headers.length > 0
        ? 'headers'
        : allowsBody && (body.length > 0 || rawMode)
          ? 'body'
          : 'params',
  )
  const tab = $derived(
    picked?.targetId === target.id && (picked.tab !== 'body' || allowsBody) ? picked.tab : defaultTab,
  )

  const tabs = $derived([
    { id: 'params' as const, label: 'Params', count: String(params.length) },
    { id: 'headers' as const, label: 'Headers', count: String(headers.length) },
    ...(allowsBody
      ? [{ id: 'body' as const, label: 'Body', count: rawMode ? 'raw' : String(body.length) }]
      : []),
  ])

  const addPlaceholder = $derived(
    tab === 'params' ? 'query param name' : tab === 'headers' ? 'header name, e.g. X-Api-Key' : 'field name, user.name nests',
  )

  function addField() {
    const name = newName.trim()
    if (name === '') return
    const key = sectionKey(tab, name, target.path)
    if (target.fields.some((f) => f.key === key)) return
    target.setField({ key, source: 'literal', value: '' })
    newName = ''
  }

  function setRawMode(on: boolean) {
    target.setRawBody?.(on ? (target.rawBody ?? { contentType: 'application/json', text: '' }) : undefined)
  }
</script>

<div>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-0.5" role="tablist" aria-label="Request sections">
      {#each tabs as t (t.id)}
        <button
          role="tab"
          aria-selected={tab === t.id}
          class="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase {tab === t.id
            ? 'bg-zinc-800 text-zinc-100'
            : 'text-zinc-500 hover:text-zinc-300'}"
          onclick={() => (picked = { targetId: target.id, tab: t.id })}
        >
          {t.label}
          <span class="font-mono text-[9px] {tab === t.id ? 'text-zinc-400' : 'text-zinc-600'}">{t.count}</span>
        </button>
      {/each}
    </div>
    {#if target.nodeId}
      <span class="text-[10px] text-zinc-600">literal · res.path · {'{{'}…{'}}'}</span>
    {:else}
      <span class="text-[10px] text-zinc-600">literal defaults</span>
    {/if}
  </div>

  <div class="mt-1.5 space-y-1.5">
    {#if tab === 'params'}
      {#each params as row (row.field.key)}
        <FieldRow
          {target}
          field={row.field}
          kindBadge={row.kind}
          required={row.required}
          orphan={row.orphan}
          removable={row.kind === 'query' || row.orphan}
        />
      {:else}
        <p class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-600">
          No params — path placeholders like <span class="font-mono">{'{id}'}</span> appear here; add query params below.
        </p>
      {/each}
    {:else if tab === 'headers'}
      {#each headers as field (field.key)}
        <FieldRow {target} {field} />
      {:else}
        <p class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-600">
          No headers — add one below, e.g. <span class="font-mono">X-Internal-Token</span>.
        </p>
      {/each}
    {:else}
      {#if supportsRaw}
        <div class="flex items-center gap-1">
          <button
            class="rounded px-1.5 py-0.5 text-[10px] {rawMode
              ? 'text-zinc-500 hover:text-zinc-300'
              : 'bg-zinc-800 text-zinc-100'}"
            onclick={() => setRawMode(false)}
          >
            fields
          </button>
          <button
            class="rounded px-1.5 py-0.5 text-[10px] {rawMode
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'}"
            onclick={() => setRawMode(true)}
          >
            raw
          </button>
        </div>
      {/if}
      {#if rawMode && target.rawBody}
        <RawBodyEditor {target} rawBody={target.rawBody} />
      {:else}
        {#each body as field (field.key)}
          <FieldRow {target} {field} />
        {:else}
          <p class="rounded-md border border-dashed border-zinc-800 px-2 py-3 text-center text-[11px] text-zinc-600">
            No body fields — add one below; <span class="font-mono">user.name</span> nests.
          </p>
        {/each}
      {/if}
    {/if}

    {#if tab !== 'body' || !rawMode}
      <div class="flex items-center gap-1">
        <Input
          size="sm"
          surface="raised"
          mono
          class="min-w-0 flex-1"
          placeholder={addPlaceholder}
          bind:value={newName}
          onkeydown={(e) => {
            if (e.key === 'Enter') addField()
          }}
        />
        <Button
          variant="secondary"
          size="xs"
          disabled={newName.trim() === ''}
          onclick={addField}
          title="Add {tab === 'params' ? 'query param' : tab === 'headers' ? 'header' : 'body field'}"
        >
          <Icon name="add" size={13} />
          Add
        </Button>
      </div>
    {/if}
  </div>
</div>
