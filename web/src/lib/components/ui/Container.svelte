<script lang="ts">
  import type { Snippet } from 'svelte'

  const WIDTH = {
    default: 'max-w-7xl',
    narrow: 'max-w-4xl',
    wide: 'max-w-[88rem]',
  } as const

  let {
    width = 'default',
    class: cls = '',
    children,
  }: { width?: keyof typeof WIDTH; class?: string; children: Snippet } = $props()
</script>

<div class="mx-auto w-full px-4 sm:px-6 lg:px-8 {WIDTH[width]} {cls}">
  {@render children()}
</div>
