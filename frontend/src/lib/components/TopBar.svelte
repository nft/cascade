<script lang="ts">
  import { app } from '../state.svelte'
  import Icon from './Icon.svelte'
  import ProjectSwitcher from './ProjectSwitcher.svelte'
  import Button from './ui/Button.svelte'
</script>

<header class="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-surface px-4">
  <span class="text-sm font-semibold tracking-tight">Cascade</span>
  <ProjectSwitcher />

  <div class="ml-auto flex items-center gap-2">
    <Button variant="secondary" title="Import an OpenAPI / Swagger document (wired in M2)">
      <Icon name="upload_file" size={14} />
      Import schema
    </Button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <Button variant="primary" disabled={app.isRunning} onclick={() => app.simulateRun()}>
      <Icon name="play_arrow" size={14} filled={app.isRunning} />
      {app.isRunning ? 'Running…' : 'Run'}
    </Button>
    <Button variant="secondary" disabled title="Pause — engine support lands in M7">
      <Icon name="pause" size={14} />
      Pause
    </Button>
    <Button variant="secondary" disabled title="Stop — engine support lands in M7">
      <Icon name="stop" size={14} />
      Stop
    </Button>
  </div>
</header>
