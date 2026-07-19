<script lang="ts">
  import { app } from '../state.svelte'
  import BoardMenu from './BoardMenu.svelte'
  import Icon from './Icon.svelte'
  import Logo from './Logo.svelte'
  import ProjectSwitcher from './ProjectSwitcher.svelte'
  import Button from './ui/Button.svelte'
  import IconButton from './ui/IconButton.svelte'
</script>

<header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-surface px-4">
  <IconButton
    icon={app.sidebarOpen ? 'left_panel_close' : 'left_panel_open'}
    iconSize={16}
    label={app.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    title={app.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
    onclick={() => (app.sidebarOpen = !app.sidebarOpen)}
  />
  <ProjectSwitcher />

  <div class="ml-auto flex items-center gap-2">
    <Button variant="secondary" title="Import an OpenAPI / Swagger document (wired in M2)">
      <Icon name="upload_file" size={14} />
      Import schema
    </Button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <!-- One Run/Pause toggle: pausing stays disabled until the engine supports it (M7). -->
    <Button
      variant="primary"
      disabled={app.isRunning}
      title={app.isRunning ? 'Pause — engine support lands in M7' : undefined}
      onclick={() => app.simulateRun()}
    >
      <Icon name={app.isRunning ? 'pause' : 'play_arrow'} size={14} filled={app.isRunning} />
      {app.isRunning ? 'Pause' : 'Run'}
    </Button>
    <Button variant="secondary" disabled title="Stop — engine support lands in M7">
      <Icon name="stop" size={14} />
      Stop
    </Button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <BoardMenu />
  </div>
</header>
