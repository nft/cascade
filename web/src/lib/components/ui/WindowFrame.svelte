<script lang="ts">
  import type { Snippet } from 'svelte'

  // A macOS-style window around product imagery: traffic lights and a title,
  // on the app's own zinc chrome so screenshots sit in a matching frame.
  let {
    title,
    class: cls = '',
    toolbar,
    children,
  }: { title: string; class?: string; toolbar?: Snippet; children: Snippet } = $props()
</script>

<div class="overflow-hidden rounded-2xl bg-zinc-950 shadow-window {cls}">
  <div class="relative flex h-9 items-center border-b border-white/6 bg-zinc-900/90 px-3.5">
    <span class="flex gap-2" aria-hidden="true">
      <span class="size-3 rounded-full bg-mac-close"></span>
      <span class="size-3 rounded-full bg-mac-minimize"></span>
      <span class="size-3 rounded-full bg-mac-zoom"></span>
    </span>
    <span class="absolute inset-x-24 truncate text-center text-xs font-medium text-zinc-400">{title}</span>
    {#if toolbar}
      <span class="ml-auto flex items-center gap-2">{@render toolbar()}</span>
    {/if}
  </div>
  {@render children()}
</div>
