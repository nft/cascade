<script lang="ts">
  // Shared modal chrome for the library dialogs: backdrop,
  // panel, titled header, Escape/backdrop-click to close. Escape stops
  // propagation so the global chain doesn't also clear the selection.
  import type { Snippet } from 'svelte'

  let {
    title,
    onclose,
    wide = false,
    children,
  }: { title: string; onclose: () => void; wide?: boolean; children: Snippet } = $props()
</script>

<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
  role="presentation"
  onpointerdown={(e) => {
    if (e.target === e.currentTarget) onclose()
  }}
>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
    class="flex max-h-full {wide ? 'w-[36rem]' : 'w-96'} max-w-full flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
    onkeydown={(e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onclose()
      }
    }}
  >
    <h2 class="border-b border-zinc-800 px-4 py-2.5 text-xs font-semibold tracking-wide text-zinc-300 uppercase">
      {title}
    </h2>
    <div class="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {@render children()}
    </div>
  </div>
</div>
