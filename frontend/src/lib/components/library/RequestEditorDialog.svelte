<script lang="ts">
  // Library-first request editing (plan 08 B3): the exact A2 sectioned
  // editor rendered over a draft RequestDef via the adapter, plus the two
  // library-only tabs — Schemas (C8) and Test (C9). Nothing touches the
  // canvas; save writes the definition into the collection.
  import { findRequest, libraryId } from '../../collections'
  import { dialogs, type RequestEditorContext } from '../../dialogs.svelte'
  import { upsertCollectionRequest } from '../../library'
  import { HTTP_METHODS, isHttpMethod, type RequestDef } from '../../model'
  import { draftTarget } from '../../requestEditor'
  import { app } from '../../state.svelte'
  import { methodText } from '../../ui'
  import RequestSection from '../inspector/RequestSection.svelte'
  import Button from '../ui/Button.svelte'
  import { FIELD_LABEL } from '../ui/classes'
  import Field from '../ui/Field.svelte'
  import Input from '../ui/Input.svelte'
  import Select from '../ui/Select.svelte'
  import ModalShell from './ModalShell.svelte'
  import RequestSchemasPane from './RequestSchemasPane.svelte'
  import RequestTestPane from './RequestTestPane.svelte'

  let { context }: { context: RequestEditorContext } = $props()

  const WS_TITLE = 'WebSocket requests land later'

  const TABS = [
    { id: 'request', label: 'Request' },
    { id: 'schemas', label: 'Schemas' },
    { id: 'test', label: 'Test' },
  ] as const
  type TabId = (typeof TABS)[number]['id']

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

  let tab = $state<TabId>('request')
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
    upsertCollectionRequest(app, collectionId, folderId, request)
    close()
  }
</script>

<ModalShell title={existing ? 'Edit request' : 'New request'} onclose={close} wide>
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

  <Field label="Name">
    <Input bind:el={nameEl} bind:value={draft.name} class="mt-1 w-full" placeholder="Create invoice" />
  </Field>

  <div>
    <span class={FIELD_LABEL}>Request</span>
    <div class="mt-1 flex items-center gap-1.5">
      <Select
        size="dense"
        class="shrink-0 font-semibold {methodText[draft.method ?? 'GET']}"
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
      </Select>
      <Input
        bind:value={draft.url}
        size="dense"
        mono
        class="min-w-0 flex-1"
        placeholder="/v1/invoices or https://api.example.com/v1/invoices"
        aria-label="Request URL"
      />
    </div>
    <p class="mt-1 text-[10px] leading-relaxed text-zinc-600">
      A path resolves against the node's environment; an absolute URL carries its own origin.
    </p>
  </div>

  <div class="flex items-center gap-1 border-t border-zinc-800 pt-2" role="tablist" aria-label="Request editor tabs">
    {#each TABS as t (t.id)}
      <button
        role="tab"
        aria-selected={tab === t.id}
        class="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase {tab === t.id
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (tab = t.id)}
      >
        {t.label}
      </button>
    {/each}
  </div>

  {#if tab === 'request'}
    <RequestSection {target} />

    <Field label="Description">
      <Input bind:value={draft.description} class="mt-1 w-full" placeholder="optional" />
    </Field>
  {:else if tab === 'schemas'}
    <RequestSchemasPane {draft} />
  {:else}
    <RequestTestPane {draft} />
  {/if}

  <div class="flex justify-end gap-1.5 border-t border-zinc-800 pt-2">
    <Button variant="ghost" onclick={close}>Cancel</Button>
    <Button variant="primary" disabled={!canSave} onclick={save}>
      {existing ? 'Save changes' : 'Add to collection'}
    </Button>
  </div>
</ModalShell>
