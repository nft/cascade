<script lang="ts">
  import { onMount } from 'svelte'
  import ConfirmDeleteForDialog from './lib/components/ConfirmDeleteForDialog.svelte'
  import GraphCanvas from './lib/components/GraphCanvas.svelte'
  import Inspector from './lib/components/Inspector.svelte'
  import Toast from './lib/components/Toast.svelte'
  import RequestEditorDialog from './lib/components/library/RequestEditorDialog.svelte'
  import SaveToCollectionDialog from './lib/components/library/SaveToCollectionDialog.svelte'
  import CredentialDialog from './lib/components/sidebar/CredentialDialog.svelte'
  import EnvironmentDialog from './lib/components/sidebar/EnvironmentDialog.svelte'
  import ImportMappingDialog from './lib/components/ImportMappingDialog.svelte'
  import LogsPanel from './lib/components/LogsPanel.svelte'
  import NoticeDialog from './lib/components/NoticeDialog.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import TopBar from './lib/components/TopBar.svelte'
  import { dialogs } from './lib/dialogs.svelte'
  import { handleGlobalKeydown } from './lib/keyboard'
  import { app } from './lib/state.svelte'

  // Load the project index and reopen the last-opened project (plan 01).
  onMount(() => void app.init())
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<div class="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
  <TopBar />
  <div class="flex min-h-0 flex-1">
    {#if app.sidebarOpen}
      <Sidebar />
    {/if}
    <main class="flex min-w-0 flex-1 flex-col">
      <GraphCanvas />
      <LogsPanel />
    </main>
    <Inspector />
  </div>
</div>

<!-- Library dialogs (plan 08 B3) remount per open, so their drafts init fresh. -->
{#if dialogs.saveToCollection}
  <SaveToCollectionDialog nodeId={dialogs.saveToCollection.nodeId} />
{/if}
{#if dialogs.requestEditor}
  <RequestEditorDialog context={dialogs.requestEditor} />
{/if}
{#if dialogs.credential}
  <CredentialDialog context={dialogs.credential} />
{/if}
{#if dialogs.environment}
  <EnvironmentDialog context={dialogs.environment} />
{/if}
{#if dialogs.notice}
  <NoticeDialog title={dialogs.notice.title} message={dialogs.notice.message} />
{/if}
{#if dialogs.importMapping}
  <ImportMappingDialog context={dialogs.importMapping} />
{/if}
{#if dialogs.confirmDeleteFor}
  <ConfirmDeleteForDialog
    nodeId={dialogs.confirmDeleteFor.nodeId}
    childCount={dialogs.confirmDeleteFor.childCount}
  />
{/if}
<Toast />
