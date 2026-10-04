<script lang="ts">
  // Shared modal chrome for the library dialogs: backdrop,
  // panel, titled header, Escape/backdrop-click to close. Every keydown stops
  // here so the global shortcuts (tool keys, copy/paste, sidebar) stay quiet
  // behind a modal.
  import type { Snippet } from 'svelte'
  import type { Attachment } from 'svelte/attachments'

  // flush drops the body padding and lays children out as a row, for dialogs
  // that bring their own edge-to-edge columns (Settings' nav + content).
  let {
    title,
    onclose,
    wide = false,
    flush = false,
    children,
  }: { title: string; onclose: () => void; wide?: boolean; flush?: boolean; children: Snippet } = $props()

  // A dialog opened from a button would otherwise leave focus on that button,
  // and Escape would never reach the dialog. Children that focus a field of
  // their own keep it; focus goes back to the opener when the dialog closes.
  const holdFocus: Attachment<HTMLElement> = (node) => {
    const opener = document.activeElement
    if (!node.contains(document.activeElement)) node.focus()
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus()
    }
  }
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
    class="ui-scaled flex max-h-full {wide ? 'w-[36rem]' : 'w-96'} max-w-full flex-col rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl"
    {@attach holdFocus}
    onkeydown={(e) => {
      e.stopPropagation()
      if (e.key === 'Escape') onclose()
    }}
  >
    <h2 class="border-b border-zinc-800 px-4 py-2.5 text-xs font-semibold tracking-wide text-zinc-300 uppercase">
      {title}
    </h2>
    <div class={flush ? 'flex min-h-0 flex-1' : 'min-h-0 flex-1 space-y-3 overflow-y-auto p-4'}>
      {@render children()}
    </div>
  </div>
</div>
