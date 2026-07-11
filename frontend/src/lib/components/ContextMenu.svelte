<script lang="ts">
  import { useSvelteFlow } from '@xyflow/svelte'
  import { menuItems, type MenuItem } from '../contextMenu'
  import { dialogs } from '../dialogs.svelte'
  import { libraryLinkState } from '../library'
  import { isHttpNode, type Operation } from '../model'
  import { copyNodes, pasteFromClipboard, selectionForCopy } from '../shareActions'
  import { app } from '../state.svelte'
  import { methodBadge } from '../ui'
  import Icon from './Icon.svelte'
  import Input from './ui/Input.svelte'

  const { screenToFlowPosition, fitView } = useSvelteFlow()

  const menu = $derived(app.contextMenu)
  const items = $derived.by(() => {
    if (!menu) return []
    const node = menu.id !== undefined ? app.nodes.find((n) => n.id === menu.id) : undefined
    return menuItems(menu.kind, {
      isRunning: app.isRunning,
      hasResponse: menu.id !== undefined && menu.id in app.responses,
      nodeType: node?.type,
      library: node && isHttpNode(node) ? libraryLinkState(app.collections, node.data) : undefined,
    })
  })

  let paletteOpen = $state(false)
  let query = $state('')
  let menuEl = $state<HTMLElement | null>(null)
  let searchEl = $state<HTMLInputElement | null>(null)

  const filtered = $derived(
    app.operations.filter((op) =>
      `${op.method} ${op.path} ${op.summary}`.toLowerCase().includes(query.toLowerCase()),
    ),
  )

  $effect(() => {
    if (!menu) return
    paletteOpen = false
    query = ''
    if (!menu.flow) menu.flow = screenToFlowPosition(menu.screen)
  })

  $effect(() => {
    if (paletteOpen) searchEl?.focus()
  })

  function run(item: MenuItem) {
    if (!menu || item.disabled) return
    switch (item.action) {
      case 'add-node':
        paletteOpen = true
        return // keep the menu open, showing the palette
      case 'add-custom-request':
        app.addCustomHttpNode(menu.flow ?? screenToFlowPosition(menu.screen))
        break
      case 'add-transform':
        app.addTransformNode(menu.flow ?? screenToFlowPosition(menu.screen))
        break
      case 'add-note':
        app.addNoteNode(menu.flow ?? screenToFlowPosition(menu.screen))
        break
      case 'paste':
        void pasteFromClipboard(app, menu.flow ?? screenToFlowPosition(menu.screen))
        break
      case 'fit-view':
        fitView()
        break
      case 'run-node':
        if (menu.id) app.simulateRun(menu.id, 'upstream')
        break
      case 'run-chain':
        if (menu.id) app.simulateRun(menu.id, 'component')
        break
      case 'copy':
        if (menu.id) void copyNodes(app, selectionForCopy(app.nodes, menu.id))
        break
      case 'duplicate':
        if (menu.id) app.duplicateNode(menu.id)
        break
      case 'rename':
        if (menu.id) app.requestRename(menu.id)
        break
      case 'use-as-schema':
        if (menu.id) app.useLastResponseAsSchema(menu.id)
        break
      case 'save-to-collection':
        if (menu.id) dialogs.saveToCollection = { nodeId: menu.id }
        break
      case 'update-collection-request':
        if (menu.id) app.updateCollectionRequestFromNode(menu.id)
        break
      case 'delete-node':
        if (menu.id) app.removeNode(menu.id)
        break
      case 'cut-edge':
        if (menu.id) app.removeEdge(menu.id)
        break
    }
    app.closeContextMenu()
  }

  function pick(op: Operation) {
    if (!menu) return
    app.addNode(op, menu.flow ?? screenToFlowPosition(menu.screen))
    app.closeContextMenu()
  }

  function onPointerDown(event: PointerEvent) {
    if (menu && menuEl && !menuEl.contains(event.target as Node)) app.closeContextMenu()
  }
</script>

<svelte:window onpointerdown={onPointerDown} />

{#if menu}
  <div
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
    data-testid="context-menu"
    class="fixed top-(--cm-y) left-(--cm-x) z-50 min-w-44 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
    style="--cm-x:{menu.screen.x}px; --cm-y:{menu.screen.y}px"
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#if paletteOpen}
      <div class="px-1.5 pb-1.5">
        <Input
          bind:el={searchEl}
          bind:value={query}
          size="sm"
          surface="popover"
          class="w-full"
          placeholder="Search operations…"
        />
      </div>
      <div class="max-h-56 w-64 overflow-y-auto px-1 pb-1">
        {#each filtered as op (op.ref)}
          <button
            role="menuitem"
            class="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-zinc-800"
            onclick={() => pick(op)}
            title={op.summary}
          >
            <span class="w-12 shrink-0 rounded px-1 py-0.5 text-center text-[10px] font-semibold {methodBadge[op.method]}">
              {op.method}
            </span>
            <span class="truncate font-mono text-[11px] text-zinc-300">{op.path}</span>
          </button>
        {:else}
          <p class="px-2 py-2 text-center text-[11px] text-zinc-600">No matching operations</p>
        {/each}
      </div>
    {:else}
      {#each items as item (item.action)}
        <button
          role="menuitem"
          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:text-zinc-600 {item.danger
            ? 'text-rose-400 hover:bg-rose-500/10'
            : 'text-zinc-300 hover:bg-zinc-800'}"
          disabled={item.disabled}
          title={item.title}
          onclick={() => run(item)}
        >
          <Icon name={item.icon} size={14} />
          {item.label}
        </button>
      {/each}
    {/if}
  </div>
{/if}
