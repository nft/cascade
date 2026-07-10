<script lang="ts">
  // Board overflow menu in the top bar (plan 07 E2): file export and
  // copy-as-JSON for chat-sized boards. Copy feedback is inline — the row
  // flips to "Copied" briefly — since there is no toast infrastructure yet.
  import { copyBoardJson, exportBoardToFile } from '../shareActions'
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'
  import IconButton from './ui/IconButton.svelte'

  const COPIED_FLASH_MS = 1200

  let open = $state(false)
  let copied = $state(false)
  let rootEl = $state<HTMLElement | null>(null)
  let copyTimer: ReturnType<typeof setTimeout> | undefined

  function close() {
    open = false
    copied = false
    clearTimeout(copyTimer)
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (open && rootEl && !rootEl.contains(event.target as Node)) close()
  }

  async function onExport() {
    close()
    await exportBoardToFile(app)
  }

  async function onCopy() {
    if (!(await copyBoardJson(app))) {
      close()
      return
    }
    copied = true
    clearTimeout(copyTimer)
    copyTimer = setTimeout(close, COPIED_FLASH_MS)
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="relative" bind:this={rootEl} data-testid="board-menu">
  <IconButton
    icon="more_vert"
    label="Board menu"
    title="Board menu"
    disabled={app.boardId === null}
    onclick={() => (open ? close() : (open = true))}
  />

  {#if open}
    <div class="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
      <button
        role="menuitem"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
        onclick={onExport}
      >
        <Icon name="download" size={14} />
        Export board…
      </button>
      <button
        role="menuitem"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs {copied
          ? 'text-emerald-400'
          : 'text-zinc-300 hover:bg-zinc-800'}"
        onclick={onCopy}
      >
        <Icon name={copied ? 'check' : 'content_copy'} size={14} />
        {copied ? 'Copied' : 'Copy board as JSON'}
      </button>
    </div>
  {/if}
</div>
