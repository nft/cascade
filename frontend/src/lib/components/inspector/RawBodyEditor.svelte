<script lang="ts">
  import type { RawBody } from '../../model'
  import { formatJsonBody, isJsonContentType, jsonBodyParses } from '../../request'
  import type { RequestEditorTarget } from '../../requestEditor'
  import IconButton from '../ui/IconButton.svelte'
  import Input from '../ui/Input.svelte'
  import BindingPicker from './BindingPicker.svelte'
  import CodeEditor from './CodeEditor.svelte'

  let { target, rawBody }: { target: RequestEditorTarget; rawBody: RawBody } = $props()

  // Bindings are board concepts: the reference picker only exists on nodes.
  const boundNodeId = $derived(target.nodeId ?? null)
  const isJson = $derived(isJsonContentType(rawBody.contentType))
  const invalidJson = $derived(isJson && rawBody.text.trim() !== '' && !jsonBodyParses(rawBody.text))
  // Format is offered only when the text parses as typed — reformatting would
  // destroy {{…}} templates outside string literals (formatJsonBody nulls out).
  const formatted = $derived(isJson ? formatJsonBody(rawBody.text) : null)

  let editor = $state<ReturnType<typeof CodeEditor>>()
  let pickerOpen = $state(false)

  function patch(change: Partial<RawBody>) {
    target.setRawBody?.({ ...rawBody, ...change })
  }

  function insert(text: string) {
    pickerOpen = false
    editor?.insertText(text)
  }
</script>

<div class="space-y-1.5">
  <div class="flex items-center gap-1">
    <Input
      size="sm"
      surface="raised"
      mono
      class="min-w-0 flex-1"
      value={rawBody.contentType}
      placeholder="content type, e.g. application/json"
      aria-label="Raw body content type"
      oninput={(e) => patch({ contentType: e.currentTarget.value })}
    />
    {#if formatted !== null && formatted !== rawBody.text}
      <IconButton
        icon="format_align_left"
        onclick={() => patch({ text: formatted })}
        title="Format JSON"
        label="Format JSON body"
      />
    {/if}
    {#if boundNodeId}
      <IconButton
        icon="add_link"
        tone={pickerOpen ? 'accent' : 'default'}
        onclick={() => (pickerOpen = !pickerOpen)}
        title="Insert reference at cursor…"
        label="Insert reference into the raw body"
      />
    {/if}
  </div>
  {#if pickerOpen && boundNodeId}
    <BindingPicker nodeId={boundNodeId} onInsert={insert} />
  {/if}
  <CodeEditor
    bind:this={editor}
    value={rawBody.text}
    language={isJson ? 'json' : 'javascript'}
    onChange={(text) => patch({ text })}
  />
  {#if invalidJson}
    <p class="text-[10px] text-amber-400">not valid JSON yet (checked with {'{{'}…{'}}'} references ignored)</p>
  {/if}
  <p class="text-[10px] leading-relaxed text-zinc-600">
    Sent verbatim after {'{{'}…{'}}'} templates resolve; body fields are ignored while raw mode is on.
  </p>
</div>
