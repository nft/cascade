<script lang="ts">
  // The COLLECTIONS half of the requests tree: user-editable
  // request library with nestable folders, row context menus, inline rename,
  // and click-to-instantiate. Folder recursion is a snippet so all tree
  // interaction state stays in this one component.
  import { SvelteSet } from 'svelte/reactivity'
  import {
    addCollectionFolder,
    createCollection,
    deleteCollection,
    deleteCollectionFolder,
    deleteCollectionRequest,
    duplicateCollectionRequest,
    renameCollection,
    renameCollectionFolder,
    renameCollectionRequest,
  } from '../../collectionActions.svelte'
  import {
    flattenRequests,
    folderById,
    folderDepth,
    MAX_FOLDER_DEPTH,
    requestMatches,
    requestRefCount,
    ROOT_FOLDER_ID,
  } from '../../collections'
  import { libraryMenuItems, type LibraryMenuKind } from '../../contextMenu'
  import { dialogs } from '../../dialogs.svelte'
  import type { CollectionDef, CollectionFolder, RequestDef } from '../../model'
  import { app } from '../../state.svelte'
  import Icon from '../Icon.svelte'
  import Button from '../ui/Button.svelte'
  import Input from '../ui/Input.svelte'
  import RequestRow from './RequestRow.svelte'

  let { query }: { query: string } = $props()

  const DEFAULT_COLLECTION_NAME = 'New collection'
  const DEFAULT_FOLDER_NAME = 'New folder'

  /** Collapsed collection/folder ids — default expanded, so fresh trees are visible. */
  const collapsed = new SvelteSet<string>()

  interface MenuState {
    kind: LibraryMenuKind
    collectionId: string
    /** The folder the target lives in (requests) or is (folders); root for collections. */
    folderId: string
    requestId?: string
    /** Current name of the target, seeding the rename draft. */
    name: string
    screen: { x: number; y: number }
    confirmingDelete: boolean
  }
  let menu = $state<MenuState | null>(null)
  let editing = $state<{ kind: LibraryMenuKind; collectionId: string; id: string; draft: string } | null>(null)
  let menuEl = $state<HTMLElement | null>(null)
  let renameEl = $state<HTMLInputElement | null>(null)

  $effect(() => {
    if (editing && renameEl) {
      renameEl.focus()
      renameEl.select()
    }
  })

  const menuCollection = $derived.by(() => {
    const m = menu
    return m ? (app.collections.find((c) => c.id === m.collectionId) ?? null) : null
  })
  const menuRefCount = $derived.by(() => {
    const m = menu
    if (!m || !menuCollection) return 0
    if (m.kind === 'request') return requestRefCount(app.allNodeData(), m.collectionId, m.requestId)
    if (m.kind === 'collection') return requestRefCount(app.allNodeData(), m.collectionId)
    // Folder: references to any request inside it.
    const folder = folderById(menuCollection.root, m.folderId)
    if (!folder) return 0
    return flattenRequests(folder).reduce(
      (sum, { request }) => sum + requestRefCount(app.allNodeData(), m.collectionId, request.id),
      0,
    )
  })
  const menuAtDepthCap = $derived(
    menu?.kind === 'folder' && menuCollection
      ? (folderDepth(menuCollection.root, menu.folderId) ?? 0) >= MAX_FOLDER_DEPTH
      : false,
  )
  const menuItems = $derived(
    menu ? libraryMenuItems(menu.kind, { atDepthCap: menuAtDepthCap, refCount: menuRefCount }) : [],
  )

  function openMenu(event: MouseEvent, state: Omit<MenuState, 'screen' | 'confirmingDelete'>) {
    event.preventDefault()
    event.stopPropagation()
    menu = { ...state, screen: { x: event.clientX, y: event.clientY }, confirmingDelete: false }
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (menu && menuEl && !menuEl.contains(event.target as Node)) menu = null
  }

  function toggle(id: string) {
    if (collapsed.has(id)) collapsed.delete(id)
    else collapsed.add(id)
  }

  function runAction(action: string) {
    if (!menu) return
    const m = menu
    switch (action) {
      case 'new-request':
        dialogs.requestEditor = { collectionId: m.collectionId, folderId: m.folderId }
        break
      case 'edit-request':
        if (m.requestId) {
          dialogs.requestEditor = {
            collectionId: m.collectionId,
            folderId: m.folderId,
            requestId: m.requestId,
          }
        }
        break
      case 'new-folder': {
        const id = addCollectionFolder(app, m.collectionId, m.folderId, DEFAULT_FOLDER_NAME)
        if (id) {
          collapsed.delete(m.folderId)
          collapsed.delete(m.collectionId)
          editing = { kind: 'folder', collectionId: m.collectionId, id, draft: DEFAULT_FOLDER_NAME }
        }
        break
      }
      case 'rename-item':
        editing = {
          kind: m.kind,
          collectionId: m.collectionId,
          id: m.kind === 'collection' ? m.collectionId : m.kind === 'folder' ? m.folderId : m.requestId!,
          draft: m.name,
        }
        break
      case 'duplicate-request':
        if (m.requestId) duplicateCollectionRequest(app, m.collectionId, m.folderId, m.requestId)
        break
      case 'delete-item':
        // Two-step confirm, ProjectSwitcher-style: first click arms, second deletes.
        if (!m.confirmingDelete) {
          menu = { ...m, confirmingDelete: true }
          return
        }
        if (m.kind === 'collection') void deleteCollection(app, m.collectionId)
        else if (m.kind === 'folder') deleteCollectionFolder(app, m.collectionId, m.folderId)
        else if (m.requestId) deleteCollectionRequest(app, m.collectionId, m.requestId)
        break
    }
    menu = null
  }

  function commitRename() {
    if (!editing) return
    const { kind, collectionId, id, draft } = editing
    editing = null
    const name = draft.trim()
    if (!name) return
    if (kind === 'collection') renameCollection(app, collectionId, name)
    else if (kind === 'folder') renameCollectionFolder(app, collectionId, id, name)
    else renameCollectionRequest(app, collectionId, id, name)
  }

  function onRenameKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') commitRename()
    else if (event.key === 'Escape') {
      event.stopPropagation()
      editing = null
    }
  }

  function newCollection() {
    const collection = createCollection(app, DEFAULT_COLLECTION_NAME)
    if (collection) {
      editing = {
        kind: 'collection',
        collectionId: collection.id,
        id: collection.id,
        draft: collection.name,
      }
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<!-- One-way value + oninput mirror rather than bind:value — snippet params are
     lazy getters, so a binding would still read `editing` after commit nulls it
     while a blur is in flight. -->
{#snippet renameInput(draft: string)}
  <Input
    bind:el={renameEl}
    value={draft}
    oninput={(e) => {
      if (editing) editing.draft = e.currentTarget.value
    }}
    onkeydown={onRenameKeydown}
    onblur={commitRename}
    size="2xs"
    surface="popover"
    class="min-w-0 flex-1"
    aria-label="Rename"
  />
{/snippet}

{#snippet requestRows(collection: CollectionDef, folder: CollectionFolder, depth: number)}
  {#each folder.requests as request (request.id)}
    {#if editing?.id === request.id}
      <div class="flex items-center gap-1 py-0.5 pl-(--tree-pad)" style="--tree-pad:{depth * 12}px">
        {@render renameInput(editing.draft)}
      </div>
    {:else}
      <div class="pl-(--tree-pad)" style="--tree-pad:{depth * 12}px">
        <RequestRow
          {request}
          onpick={() => app.addNodeFromRequest(collection.id, request)}
          oncontextmenu={(e) =>
            openMenu(e, {
              kind: 'request',
              collectionId: collection.id,
              folderId: folder.id,
              requestId: request.id,
              name: request.name,
            })}
        />
      </div>
    {/if}
  {/each}
{/snippet}

{#snippet folderRows(collection: CollectionDef, folder: CollectionFolder, depth: number)}
  {#each folder.folders ?? [] as sub (sub.id)}
    <div
      class="flex w-full items-center gap-1 rounded-md pl-(--tree-pad) hover:bg-zinc-800/70"
      style="--tree-pad:{depth * 12}px"
    >
      {#if editing?.id === sub.id}
        <Icon name="folder" size={13} class="ml-1 shrink-0 text-zinc-500" />
        {@render renameInput(editing.draft)}
      {:else}
        <button
          class="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left"
          onclick={() => toggle(sub.id)}
          oncontextmenu={(e) =>
            openMenu(e, {
              kind: 'folder',
              collectionId: collection.id,
              folderId: sub.id,
              name: sub.name,
            })}
        >
          <Icon name={collapsed.has(sub.id) ? 'chevron_right' : 'expand_more'} size={13} class="shrink-0 text-zinc-600" />
          <Icon name="folder" size={13} class="shrink-0 text-zinc-500" />
          <span class="truncate text-[11px] text-zinc-300">{sub.name}</span>
        </button>
      {/if}
    </div>
    {#if !collapsed.has(sub.id)}
      {@render requestRows(collection, sub, depth + 1)}
      {@render folderRows(collection, sub, depth + 1)}
    {/if}
  {/each}
{/snippet}

<p class="px-1 pt-3 pb-0.5 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">Collections</p>
{#each app.collections as collection (collection.id)}
  <div class="flex w-full items-center gap-1 rounded-md hover:bg-zinc-800/70">
    {#if editing?.id === collection.id}
      <Icon name="library_books" size={13} class="ml-1 shrink-0 text-zinc-500" />
      {@render renameInput(editing.draft)}
    {:else}
      <button
        class="flex min-w-0 flex-1 items-center gap-1 px-1 py-1 text-left"
        onclick={() => toggle(collection.id)}
        oncontextmenu={(e) =>
          openMenu(e, {
            kind: 'collection',
            collectionId: collection.id,
            folderId: ROOT_FOLDER_ID,
            name: collection.name,
          })}
      >
        <Icon name={collapsed.has(collection.id) ? 'chevron_right' : 'expand_more'} size={13} class="shrink-0 text-zinc-600" />
        <Icon name="library_books" size={13} class="shrink-0 text-zinc-500" />
        <span class="truncate text-[11px] font-medium text-zinc-200">{collection.name}</span>
      </button>
    {/if}
  </div>
  {#if query.trim() !== ''}
    <!-- Search flattens the tree: matching requests only, folders elided. -->
    {#each flattenRequests(collection.root).filter(({ request }) => requestMatches(request, query)) as { request } (request.id)}
      <div class="pl-(--tree-pad)" style="--tree-pad:12px">
        <RequestRow
          {request}
          onpick={() => app.addNodeFromRequest(collection.id, request)}
          oncontextmenu={(e) => e.preventDefault()}
        />
      </div>
    {:else}
      <p class="pl-3 text-[11px] text-zinc-600">No matching requests</p>
    {/each}
  {:else if !collapsed.has(collection.id)}
    {@render requestRows(collection, collection.root, 1)}
    {@render folderRows(collection, collection.root, 1)}
  {/if}
{/each}

<Button variant="dashed" class="mt-1.5 w-full" onclick={newCollection}>
  <Icon name="add" size={14} />
  New collection
</Button>

{#if menu}
  <div
    bind:this={menuEl}
    role="menu"
    tabindex="-1"
    data-testid="library-menu"
    class="fixed top-(--cm-y) left-(--cm-x) z-50 min-w-44 rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
    style="--cm-x:{menu.screen.x}px; --cm-y:{menu.screen.y}px"
    oncontextmenu={(e) => e.preventDefault()}
  >
    {#each menuItems as item (item.action)}
      <button
        role="menuitem"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:text-zinc-600 {item.danger
          ? 'text-rose-400 hover:bg-rose-500/10'
          : 'text-zinc-300 hover:bg-zinc-800'}"
        disabled={item.disabled}
        title={item.title}
        onclick={() => runAction(item.action)}
      >
        <Icon name={item.icon} size={14} />
        {item.action === 'delete-item' && menu.confirmingDelete ? 'Really delete?' : item.label}
      </button>
    {/each}
  </div>
{/if}
