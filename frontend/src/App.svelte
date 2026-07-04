<script lang="ts">
  import GraphCanvas from './lib/components/GraphCanvas.svelte'
  import Inspector from './lib/components/Inspector.svelte'
  import LogsPanel from './lib/components/LogsPanel.svelte'
  import Sidebar from './lib/components/Sidebar.svelte'
  import TopBar from './lib/components/TopBar.svelte'
</script>

<div class="flex h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
  <TopBar />
  <div class="flex min-h-0 flex-1">
    <Sidebar />
    <main class="flex min-w-0 flex-1 flex-col">
      <GraphCanvas />
      <LogsPanel />
    </main>
    <Inspector />
  </div>
</div>
