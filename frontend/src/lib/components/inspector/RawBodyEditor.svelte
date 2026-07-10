<script lang="ts">
  import type { RawBody } from '../../model'
  import type { RequestEditorTarget } from '../../requestEditor'
  import Input from '../ui/Input.svelte'
  import CodeEditor from './CodeEditor.svelte'

  let { target, rawBody }: { target: RequestEditorTarget; rawBody: RawBody } = $props()

  function patch(change: Partial<RawBody>) {
    target.setRawBody?.({ ...rawBody, ...change })
  }
</script>

<div class="space-y-1.5">
  <Input
    size="sm"
    surface="raised"
    mono
    class="w-full"
    value={rawBody.contentType}
    placeholder="content type, e.g. application/json"
    aria-label="Raw body content type"
    oninput={(e) => patch({ contentType: e.currentTarget.value })}
  />
  <CodeEditor value={rawBody.text} onChange={(text) => patch({ text })} />
  <p class="text-[10px] leading-relaxed text-zinc-600">
    Sent verbatim after {'{{'}…{'}}'} templates resolve; body fields are ignored while raw mode is on.
  </p>
</div>
