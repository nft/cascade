<script lang="ts">
  // The request editor's schema surfaces (plan 08 C8): the response schema
  // (drives downstream binding pickers once the request is instantiated) and
  // the request body schema (will pre-list known fields in the sectioned
  // editor). Edits land on the draft; nothing persists until the dialog saves.
  import type { RequestDef, SchemaJSON } from '../../model'
  import SchemaEditor from '../schema/SchemaEditor.svelte'

  let { draft }: { draft: RequestDef } = $props()

  const SURFACES = [
    { id: 'response', label: 'Response' },
    { id: 'request-body', label: 'Request body' },
  ] as const
  type SurfaceId = (typeof SURFACES)[number]['id']

  let surface = $state<SurfaceId>('response')

  function setRequestBodySchema(schema: SchemaJSON | undefined) {
    if (schema === undefined) {
      if (draft.requestSchema === undefined) return
      delete draft.requestSchema.body
      if (Object.keys(draft.requestSchema).length === 0) delete draft.requestSchema
      return
    }
    draft.requestSchema = { ...draft.requestSchema, body: schema }
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center gap-0.5" role="tablist" aria-label="Schema surfaces">
    {#each SURFACES as s (s.id)}
      <button
        role="tab"
        aria-selected={surface === s.id}
        class="rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase {surface === s.id
          ? 'bg-zinc-800 text-zinc-100'
          : 'text-zinc-500 hover:text-zinc-300'}"
        onclick={() => (surface = s.id)}
      >
        {s.label}
      </button>
    {/each}
  </div>

  {#if surface === 'response'}
    <SchemaEditor
      schema={draft.responseSchema}
      emptyHint="No response schema yet — write one, paste an example, or run a test request."
      onChange={(schema) => {
        if (schema === undefined) delete draft.responseSchema
        else draft.responseSchema = schema
      }}
    />
  {:else}
    <SchemaEditor
      schema={draft.requestSchema?.body}
      emptyHint="No request body schema yet — write one, paste an example body, or reuse a sent test body."
      onChange={setRequestBodySchema}
    />
  {/if}
</div>
