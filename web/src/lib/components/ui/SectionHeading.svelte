<script lang="ts">
  import type { Snippet } from 'svelte'

  let {
    title,
    id,
    align = 'left',
    class: cls = '',
    children,
  }: {
    title: string
    /** Anchor for deep links to the section. */
    id?: string
    align?: 'left' | 'center'
    class?: string
    /** The lead paragraph under the title. */
    children?: Snippet
  } = $props()
</script>

<div class="max-w-2xl {align === 'center' ? 'mx-auto text-center' : ''} {cls}">
  <h2
    {id}
    class="text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-fg sm:text-4xl lg:text-[2.75rem]"
  >
    {title}
  </h2>
  {#if children}
    <p class="mt-4 text-lg leading-relaxed text-pretty text-fg-muted">{@render children()}</p>
  {/if}
</div>
