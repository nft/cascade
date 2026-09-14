<script lang="ts">
  // Board overflow menu in the top bar (plan 07): file export/import and
  // copy-as-JSON for chat-sized boards. Copy feedback is inline — the row
  // flips to "Copied" briefly — since there is no toast infrastructure yet.
  import { capturesResponses } from '../board'
  import { dialogs } from '../dialogs.svelte'
  import { setCaptureResponses } from '../projectActions.svelte'
  import { copyBoardJson, exportBoardToFile, importBoardFromFile } from '../shareActions'
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

  async function onImport() {
    close()
    await importBoardFromFile(app)
  }

  // Default-on, so it has to be findable and it has to say what it costs: a
  // bare "Capture responses" label would be a privacy setting nobody reads.
  const capturing = $derived(capturesResponses(app.project?.project))

  // The menu stays open — the point of the click is to watch the box flip.
  async function onToggleCapture() {
    const error = await setCaptureResponses(app, !capturing)
    if (error) dialogs.showToast(error)
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
    <div class="absolute top-full right-0 z-50 mt-1 w-72 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
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
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
        onclick={onImport}
      >
        <Icon name="file_open" size={14} />
        Import board…
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
      <div class="my-1 border-t border-zinc-800"></div>
      <button
        role="menuitemcheckbox"
        aria-checked={capturing}
        class="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800"
        onclick={onToggleCapture}
      >
        <Icon name={capturing ? 'check_box' : 'check_box_outline_blank'} size={14} class="mt-px shrink-0" />
        <span>
          Save response bodies in board files
          <span class="mt-0.5 block text-[10px] leading-relaxed text-zinc-600">
            They can hold access tokens and personal data, and board files are meant to live in git.
            Schemas are saved either way, so the binding picker keeps working. Applies to every board
            in this project.
          </span>
        </span>
      </button>
    </div>
  {/if}
</div>
