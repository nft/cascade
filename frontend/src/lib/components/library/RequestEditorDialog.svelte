<script lang="ts">
  // Library-first request editing (plan 08 B3): the exact A2 sectioned
  // editor rendered over a draft RequestDef via the adapter. Nothing touches
  // the canvas; save writes the definition into the collection. The Response
  // schema and Test tabs land with plan 08 C8/C9.
  import { findRequest, libraryId } from '../../collections'
  import { dialogs, type RequestEditorContext } from '../../dialogs.svelte'
  import { HTTP_METHODS, isHttpMethod, type RequestDef } from '../../model'
  import { draftTarget } from '../../requestEditor'
  import { app } from '../../state.svelte'
  import { methodBadge } from '../../ui'
  import RequestSection from '../inspector/RequestSection.svelte'
  import ModalShell from './ModalShell.svelte'

  let { context }: { context: RequestEditorContext } = $props()

  const WS_TITLE = 'WebSocket requests land later'
  const SCHEMA_TAB_TITLE = 'Schema editing lands with plan 08 C8'
  const TEST_TAB_TITLE = 'Test requests land with plan 08 C9'

  // The dialog mounts fresh per open (App.svelte), so capturing the initial
  // context is deliberate; the draft is a deep-reactive copy the section
  // components edit through the adapter until Save persists it.
  // svelte-ignore state_referenced_locally
  const { collectionId, folderId, requestId } = context
  const collection = app.collections.find((c) => c.id === collectionId)
  const existing = collection && requestId ? findRequest(collection.root, requestId) : null
  const draft = $state<RequestDef>(
    existing
      ? (structuredClone($state.snapshot(existing)) as RequestDef)
      : { id: libraryId('req'), name: '', protocol: 'http', method: 'GET', url: '', defaults: [] },
  )
  const target = draftTarget(draft)

  let nameEl = $state<HTMLInputElement | null>(null)
  $effect(() => {
    nameEl?.focus()
    nameEl?.select()
  })

  const canSave = $derived(draft.name.trim() !== '' && draft.url.trim() !== '')

  function close() {
    dialogs.requestEditor = null
  }

  function save() {
    if (!canSave) return
    const request = $state.snapshot(draft) as RequestDef
    request.name = request.name.trim()
    request.url = request.url.trim()
    if (request.description !== undefined && request.description.trim() === '') delete request.description
    if (!request.defaults?.length) delete request.defaults
    app.upsertCollectionRequest(collectionId, folderId, request)
    close()
  }
</script>

<ModalShell title={existing ? 'Edit request' : 'New request'} onclose={close}>
  <div class="flex items-center gap-1" role="radiogroup" aria-label="Protocol">
    <button
      role="radio"
      aria-checked="true"
      class="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-100 uppercase"
    >
      http
    </button>
    <button
      role="radio"
      aria-checked="false"
      class="rounded px-2 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600 uppercase disabled:cursor-not-allowed"
      disabled
      title={WS_TITLE}
    >
      ws
    </button>
  </div>

  <label class="block">
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Name</span>
    <input
      bind:this={nameEl}
      bind:value={draft.name}
      class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
      placeholder="Create invoice"
    />
  </label>

  <div>
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Request</span>
    <div class="mt-1 flex items-center gap-1.5">
      <select
        class="shrink-0 rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-1.5 text-[11px] font-semibold outline-none focus:border-zinc-500 {methodBadge[
          draft.method ?? 'GET'
        ]}"
        value={draft.method ?? 'GET'}
        aria-label="HTTP method"
        onchange={(e) => {
          const method = e.currentTarget.value
          if (isHttpMethod(method)) draft.method = method
        }}
      >
        {#each HTTP_METHODS as method (method)}
          <option value={method}>{method}</option>
        {/each}
      </select>
      <input
        bind:value={draft.url}
        class="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        placeholder="/v1/invoices or https://api.example.com/v1/invoices"
        aria-label="Request URL"
      />
    </div>
    <p class="mt-1 text-[10px] leading-relaxed text-zinc-600">
      A path resolves against the node's environment; an absolute URL carries its own origin.
    </p>
  </div>

  <RequestSection {target} />

  <label class="block">
    <span class="text-[10px] font-medium tracking-wide text-zinc-500 uppercase">Description</span>
    <input
      bind:value={draft.description}
      class="mt-1 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs outline-none placeholder:text-zinc-600 focus:border-zinc-500"
      placeholder="optional"
    />
  </label>

  <div class="flex items-center gap-1 border-t border-zinc-800 pt-2">
    <button
      class="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600 uppercase disabled:cursor-not-allowed"
      disabled
      title={SCHEMA_TAB_TITLE}
    >
      Response schema
    </button>
    <button
      class="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-zinc-600 uppercase disabled:cursor-not-allowed"
      disabled
      title={TEST_TAB_TITLE}
    >
      Test
    </button>
  </div>

  <div class="flex justify-end gap-1.5 pt-1">
    <button class="rounded px-2.5 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" onclick={close}>
      Cancel
    </button>
    <button
      class="rounded bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={!canSave}
      onclick={save}
    >
      {existing ? 'Save changes' : 'Add to collection'}
    </button>
  </div>
</ModalShell>
