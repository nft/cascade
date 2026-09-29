<script lang="ts">
  import type { Snippet } from 'svelte'
  import Container from './Container.svelte'

  // The top of every inner page: title, lead paragraph, optional actions.
  let {
    title,
    lead,
    children,
  }: { title: string; lead: string; children?: Snippet } = $props()
</script>

<header class="relative isolate overflow-hidden border-b border-white/6 pt-16 pb-14 sm:pt-24 sm:pb-20">
  <div
    aria-hidden="true"
    class="absolute inset-0 -z-10 bg-dots [mask-image:radial-gradient(ellipse_70%_90%_at_20%_0%,black,transparent)] [--dot-gap:26px]"
  ></div>
  <Container>
    <h1
      class="max-w-3xl animate-rise text-5xl leading-[1.02] font-semibold tracking-[-0.04em] text-balance motion-reduce:animate-none sm:text-6xl"
    >
      {title}
    </h1>
    <p
      class="mt-6 max-w-2xl animate-rise text-lg leading-relaxed text-pretty text-fg-muted [animation-delay:80ms] motion-reduce:animate-none sm:text-xl"
    >
      {lead}
    </p>
    {#if children}
      <div class="mt-8 flex animate-rise flex-wrap gap-3 [animation-delay:160ms] motion-reduce:animate-none">
        {@render children()}
      </div>
    {/if}
  </Container>
</header>
