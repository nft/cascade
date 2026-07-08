<script lang="ts">
  import type { HttpNode, RawBody } from '../../model'
  import { app } from '../../state.svelte'
  import CodeEditor from './CodeEditor.svelte'

  let { node, rawBody }: { node: HttpNode; rawBody: RawBody } = $props()

  function patch(change: Partial<RawBody>) {
    app.updateNodeData(node.id, { rawBody: { ...rawBody, ...change } })
  }
</script>

<div class="space-y-1.5">
  <input
    class="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-[11px] outline-none placeholder:text-zinc-600 focus:border-zinc-500"
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
