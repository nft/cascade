<script lang="ts">
  import { app } from '../state.svelte'
  import BoardMenu from './BoardMenu.svelte'
  import Icon from './Icon.svelte'
  import Logo from './Logo.svelte'
  import ProjectSwitcher from './ProjectSwitcher.svelte'
  import Button from './ui/Button.svelte'
  import UpdatePill from './update/UpdatePill.svelte'
</script>

<header class="ui-scaled flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-surface px-4">
  <Logo size={16} class="shrink-0 text-brand" />
  <ProjectSwitcher />

  <div class="ml-auto flex items-center gap-2">
    <UpdatePill />
    <Button variant="secondary" title="Import an OpenAPI / Swagger document (not available yet)">
      <Icon name="upload_file" size={14} />
      Import schema
    </Button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <!-- Run and Stop, not a Run/Pause toggle: the engine cancels but does not pause. -->
    <Button variant="primary" disabled={app.isRunning} onclick={() => app.run()}>
      <Icon name="play_arrow" size={14} />
      Run
    </Button>
    <Button variant="secondary" disabled={!app.isRunning} onclick={() => app.stopRun()}>
      <Icon name="stop" size={14} />
      Stop
    </Button>
    <div class="mx-1 h-5 w-px bg-zinc-800"></div>
    <BoardMenu />
  </div>
</header>
