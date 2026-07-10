<script lang="ts">
  // The request editor's Test tab (plan 08 B4/C9): one-off execution through
  // the SendTestRequest binding — no board, no run, no log entries. The
  // response can be parsed into an editable schema draft and saved onto the
  // request (replace or merge with what's already there).
  import { api } from '../../api'
  import { formatDuration } from '../../format'
  import type { RequestDef, SchemaJSON, TestResponse } from '../../model'
  import { inferSchema } from '../../schema'
  import { mergeInferred } from '../../schemaEdit'
  import { app } from '../../state.svelte'
  import { buildTestRequest } from '../../testRequest'
  import { httpStatusClass } from '../../ui'
  import CredentialOptions from '../CredentialOptions.svelte'
  import Icon from '../Icon.svelte'
  import SchemaEditor from '../schema/SchemaEditor.svelte'
  import Button from '../ui/Button.svelte'
  import Field from '../ui/Field.svelte'
  import Select from '../ui/Select.svelte'

  let { draft }: { draft: RequestDef } = $props()

  const NO_CREDENTIAL = ''

  // Project defaults pre-select (plan 08 B4); the URL being absolute makes
  // the environment irrelevant, but picking one is still harmless.
  // Initial picks only — the pane remounts with the dialog, so capturing the
  // current defaults once is intended.
  const defaults = app.project?.project.defaults
  let environment = $state(defaults?.environment ?? app.environments[0]?.name ?? '')
  let credential = $state(defaults?.credential ?? NO_CREDENTIAL)

  let sending = $state(false)
  let error = $state<string | null>(null)
  let result = $state<TestResponse | null>(null)
  let sentBody = $state<unknown>(undefined)
  let parsed = $state<SchemaJSON | undefined>(undefined)
  let savedNote = $state<string | null>(null)

  const envBaseUrl = $derived(app.environments.find((e) => e.name === environment)?.baseUrl ?? '')
  const bodyPreview = $derived(
    result === null ? '' : result.body !== undefined ? JSON.stringify(result.body, null, 2) : result.bodyText,
  )

  async function send() {
    error = null
    result = null
    parsed = undefined
    savedNote = null
    sentBody = undefined
    const built = buildTestRequest($state.snapshot(draft) as RequestDef, envBaseUrl, credential)
    if ('error' in built) {
      error = built.error
      return
    }
    const projectId = app.projectId
    if (projectId === null) return
    sending = true
    try {
      result = await api.sendTestRequest(projectId, built.request)
      sentBody = built.request.body
    } catch (err) {
      error = err instanceof Error ? err.message : String(err)
    } finally {
      sending = false
    }
  }

  function saveResponseSchema(mode: 'replace' | 'merge') {
    if (parsed === undefined) return
    draft.responseSchema =
      mode === 'merge' && draft.responseSchema ? mergeInferred(draft.responseSchema, parsed) : parsed
    parsed = undefined
    savedNote = 'Saved — refine it in the Schemas tab; it persists when you save the request.'
  }

  function useSentBodyAsRequestSchema() {
    draft.requestSchema = { ...draft.requestSchema, body: inferSchema(sentBody) }
    savedNote = 'Request body schema saved — see the Schemas tab.'
  }
</script>

<div class="space-y-2">
  <div class="flex items-end gap-1.5">
    <Field label="Environment" class="min-w-0 flex-1">
      <Select size="dense" class="mt-1 w-full" bind:value={environment} aria-label="Test environment">
        {#each app.environments as env (env.name)}
          <option value={env.name}>{env.name}</option>
        {/each}
      </Select>
    </Field>
    <Field label="Credential" class="min-w-0 flex-1">
      <Select size="dense" class="mt-1 w-full" bind:value={credential} aria-label="Test credential">
        <CredentialOptions current={credential} />
      </Select>
    </Field>
    <Button variant="primary" class="shrink-0" disabled={sending || draft.url.trim() === ''} onclick={send}>
      <Icon name="send" size={13} />
      {sending ? 'Sending…' : 'Send'}
    </Button>
  </div>
  <p class="text-[10px] leading-relaxed text-zinc-600">
    Sends once through the Go side — outside any board or run. Params/headers/body come from the
    Request tab's literal defaults.
  </p>

  {#if error}
    <p class="rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1.5 text-[11px] text-rose-300">{error}</p>
  {/if}

  {#if result}
    <div class="space-y-1.5 rounded-md border border-zinc-800 p-2">
      <div class="flex items-center gap-2 text-[11px]">
        <span class="font-semibold {httpStatusClass(result.status)}">{result.status}</span>
        <span class="text-zinc-500">{formatDuration(result.durationMs)}</span>
        <span class="min-w-0 truncate font-mono text-[10px] text-zinc-600" title={result.url}>{result.url}</span>
        {#if result.truncated}
          <span class="ml-auto shrink-0 rounded bg-amber-500/15 px-1 py-px text-[9px] text-amber-300">truncated</span>
        {/if}
      </div>
      {#if result.headers && Object.keys(result.headers).length > 0}
        <details class="text-[10px] text-zinc-500">
          <summary class="cursor-pointer select-none hover:text-zinc-300">Headers</summary>
          <div class="mt-1 space-y-0.5 font-mono">
            {#each Object.entries(result.headers) as [name, value] (name)}
              <div class="truncate"><span class="text-zinc-400">{name}:</span> {value}</div>
            {/each}
          </div>
        </details>
      {/if}
      {#if bodyPreview !== ''}
        <pre class="max-h-48 overflow-auto rounded bg-zinc-950 p-2 font-mono text-[10px] leading-relaxed text-zinc-300">{bodyPreview}</pre>
      {/if}
      <div class="flex flex-wrap items-center gap-1.5">
        <Button
          variant="secondary"
          size="sm"
          disabled={result.body === undefined}
          title={result.body === undefined
            ? 'The response body is not JSON — nothing to infer from'
            : 'Infer an editable schema from this response'}
          onclick={() => (parsed = inferSchema(result?.body))}
        >
          <Icon name="schema" size={13} />
          Parse to schema
        </Button>
        {#if sentBody !== undefined}
          <Button
            variant="secondary"
            size="sm"
            title="Infer the request body schema from what was just sent"
            onclick={useSentBodyAsRequestSchema}
          >
            <Icon name="input" size={13} />
            Use sent body as request schema
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  {#if parsed !== undefined}
    <div class="space-y-1.5 rounded-md border border-violet-500/30 p-2">
      <p class="text-[10px] text-zinc-500">
        Inferred schema — edit before saving (drop noise keys, fix formats, mark nullables).
      </p>
      <SchemaEditor schema={parsed} onChange={(schema) => (parsed = schema)} />
      <div class="flex items-center gap-1.5">
        <Button variant="accent" size="sm" onclick={() => saveResponseSchema('replace')}>
          {draft.responseSchema ? 'Replace response schema' : 'Save as response schema'}
        </Button>
        {#if draft.responseSchema}
          <Button
            variant="secondary"
            size="sm"
            title="Keep your existing edits; add only keys the new response introduced"
            onclick={() => saveResponseSchema('merge')}
          >
            Merge with existing
          </Button>
        {/if}
      </div>
    </div>
  {/if}

  {#if savedNote}
    <p class="text-[11px] text-emerald-400">{savedNote}</p>
  {/if}
</div>
