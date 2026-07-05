<script lang="ts">
  import { app, type CanvasTool } from '../state.svelte'
  import Icon from './Icon.svelte'

  const tools: { id: CanvasTool; icon: string; label: string; key: string }[] = [
    { id: 'select', icon: 'arrow_selector_tool', label: 'Select', key: 'V' },
    { id: 'scissors', icon: 'content_cut', label: 'Scissors — click an edge to cut it', key: 'X' },
  ]
</script>

<div class="absolute top-3 left-3 z-10 flex overflow-hidden rounded-md border border-zinc-700 bg-zinc-900 shadow-lg">
  {#each tools as tool (tool.id)}
    <button
      class="flex h-8 w-8 items-center justify-center {app.canvasTool === tool.id
        ? 'bg-emerald-600/20 text-emerald-400'
        : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'}"
      title="{tool.label} ({tool.key})"
      aria-label={tool.label}
      aria-pressed={app.canvasTool === tool.id}
      onclick={() => (app.canvasTool = tool.id)}
    >
      <Icon name={tool.icon} size={16} />
    </button>
  {/each}
</div>
