<script module lang="ts">
  import type { RawBody } from '../../model'

  // Session-local stash of raw payloads while the fields view is showing
  // (plan 10 §3c): toggling raw→fields must not delete the typed text.
  // Deliberately NOT persisted into node data — deserializeBoard whitelists
  // keys, so a draft key would hit the board file yet be dropped on the next
  // load. Reload commits whichever mode is visible; that's the contract.
  const rawBodyStash = new Map<string, RawBody>()
</script>

<script lang="ts">
  import {
    emptyJsonRawBody,
    methodAllowsBody,
    paramRows,
    sectionFields,
    type RequestSectionId,
  } from '../../request'
  import type { RequestEditorTarget } from '../../requestEditor'
  import FieldRow from './FieldRow.svelte'
  import NewFieldRow from './NewFieldRow.svelte'
  import RawBodyEditor from './RawBodyEditor.svelte'

  // Renders over the adapter, not an HttpNode (plan 08 B3), so the request
  // editor dialog reuses the exact same sections over a library draft.
  let { target }: { target: RequestEditorTarget } = $props()

  // The active tab is derived: an explicit user pick wins while it stays
  // valid (same target, tab still shown); otherwise the first section with
  // rows — a POST with only body fields must not greet with empty Params.
  let picked = $state<{ targetId: string; tab: RequestSectionId } | null>(null)

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

  function setRawMode(on: boolean) {
    if (!target.setRawBody) return
    if (on) {
      target.setRawBody(target.rawBody ?? rawBodyStash.get(target.id) ?? emptyJsonRawBody())
    } else {
      if (target.rawBody) rawBodyStash.set(target.id, target.rawBody)
      target.setRawBody(undefined)
    }
  }
</script>

<div>
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
        <!-- raw leads (plan 10 §3c): the JSON editor is the primary body experience. -->
        <div class="flex items-center gap-1">
          <button
            class="rounded px-1.5 py-0.5 text-[10px] {rawMode
              ? 'bg-zinc-800 text-zinc-100'
              : 'text-zinc-500 hover:text-zinc-300'}"
            onclick={() => setRawMode(true)}
          >
            raw
          </button>
          <button
            class="rounded px-1.5 py-0.5 text-[10px] {rawMode
              ? 'text-zinc-500 hover:text-zinc-300'
              : 'bg-zinc-800 text-zinc-100'}"
            onclick={() => setRawMode(false)}
          >
            fields
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
      <NewFieldRow {target} section={tab} keyPlaceholder={addPlaceholder} />
    {/if}
  </div>
</div>
