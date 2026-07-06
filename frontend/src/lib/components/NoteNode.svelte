<script lang="ts">
  import type { NoteNodeData } from '../model'
  import { app } from '../state.svelte'

  let { id, data, selected = false }: { id: string; data: NoteNodeData; selected?: boolean } = $props()
</script>

<!-- Note sticky (plan 06 T6): free text, no handles — it is an annotation,
     not a step, so nothing can connect to it and it never runs. -->
<div
  class="w-48 rounded-lg border bg-amber-100/95 p-2 shadow-lg {selected
    ? 'border-amber-500'
    : 'border-amber-300/50 hover:border-amber-400/70'}"
>
  <textarea
    class="nodrag h-24 w-full resize-none bg-transparent text-[11px] leading-snug text-amber-950 outline-none placeholder:text-amber-900/40"
    value={data.text}
    placeholder="Note…"
    oninput={(e) => app.updateNodeData(id, { text: e.currentTarget.value })}
  ></textarea>
</div>
