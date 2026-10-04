<script lang="ts">
  import { sidebarTabLabel } from '../sidebarTabs'
  import { settings } from '../settings.svelte'
  import { app } from '../state.svelte'
  import CollectionsTree from './sidebar/CollectionsTree.svelte'
  import CredentialsPanel from './sidebar/CredentialsPanel.svelte'
  import EnvironmentsPanel from './sidebar/EnvironmentsPanel.svelte'
  import OperationsList from './sidebar/OperationsList.svelte'
  import SidebarRail from './sidebar/SidebarRail.svelte'
  import IconButton from './ui/IconButton.svelte'
  import Input from './ui/Input.svelte'

  const KEYBOARD_RESIZE_STEP_PX = 16

  let query = $state('')

  // Same pointer-capture drag as the logs panel's height handle.
  function resizeStart(event: PointerEvent) {
    const handle = event.currentTarget as HTMLElement
    const startX = event.clientX
    const startWidth = app.sidebarWidth
    handle.setPointerCapture(event.pointerId)
    // Pointer deltas are viewport pixels; the panel's width is in its scaled units.
    const move = (e: PointerEvent) => app.setSidebarWidth(startWidth + (e.clientX - startX) / settings.uiScale)
    const stop = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', stop)
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', stop)
  }

  function resizeKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') app.setSidebarWidth(app.sidebarWidth - KEYBOARD_RESIZE_STEP_PX)
    else if (event.key === 'ArrowRight') app.setSidebarWidth(app.sidebarWidth + KEYBOARD_RESIZE_STEP_PX)
    else return
    event.preventDefault()
  }
</script>

<div class="ui-scaled flex shrink-0">
  <SidebarRail />
  {#if app.sidebarOpen}
    <aside
      class="relative flex w-(--sidebar-w) shrink-0 flex-col border-r border-zinc-800 bg-surface"
      style="--sidebar-w:{app.sidebarWidth}px"
    >
      <header class="flex h-9 shrink-0 items-center justify-between border-b border-zinc-800 pr-1.5 pl-3">
        <h2 class="truncate text-xs font-medium text-zinc-200">{sidebarTabLabel(app.sidebarTab)}</h2>
        <IconButton
          icon="left_panel_close"
          label="Collapse sidebar"
          title="Collapse sidebar"
          onclick={() => app.toggleSidebar()}
        />
      </header>

      {#if app.sidebarTab === 'operations'}
        <div class="p-2">
          <Input surface="raised" class="w-full" placeholder="Search requests…" bind:value={query} />
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <OperationsList {query} />
          <CollectionsTree {query} />
        </div>
      {:else if app.sidebarTab === 'environments'}
        <EnvironmentsPanel />
      {:else}
        <CredentialsPanel />
      {/if}

      <!-- Drag to resize, arrow keys when focused, double-click to reset. A
           focusable separator is the ARIA window-splitter pattern; Svelte's
           lint only knows the static separator, hence the ignores. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <div
        class="absolute inset-y-0 -right-0.5 z-10 w-1 cursor-col-resize outline-none hover:bg-emerald-500/40 focus-visible:bg-emerald-500/40"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        aria-valuenow={app.sidebarWidth}
        tabindex="0"
        onpointerdown={resizeStart}
        onkeydown={resizeKeydown}
        ondblclick={() => app.resetSidebarWidth()}
      ></div>
    </aside>
  {/if}
</div>
