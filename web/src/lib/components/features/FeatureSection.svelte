<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import type { FeatureSection } from '$content/features'
  import { reveal } from '$lib/motion/reveal'
  import BindingSyntax from './BindingSyntax.svelte'
  import FeatureVisual from './FeatureVisual.svelte'

  // One feature: its pitch and points beside a visual, which alternates sides
  // down the page on wide screens.
  let { section, flip = false }: { section: FeatureSection; flip?: boolean } = $props()

  const VISUAL_DELAY_MS = 120
</script>

<!-- scroll-mt-14 clears the sticky section nav under the header. -->
<section
  id={section.id}
  aria-labelledby="{section.id}-title"
  class="scroll-mt-14 border-t border-white/6 py-20 first:border-t-0 sm:py-28"
>
  <div class="grid items-center gap-10 lg:grid-cols-12 lg:gap-16">
    <div class="lg:col-span-5 {flip ? 'lg:order-last' : ''}" {@attach reveal()}>
      <span class="grid size-11 place-items-center rounded-2xl bg-coral-500/10 ring-1 ring-coral-500/20">
        <Icon name={section.icon} size={22} class="text-coral-400" />
      </span>
      <h2
        id="{section.id}-title"
        class="mt-6 text-[2rem] leading-[1.1] font-semibold tracking-[-0.03em] text-balance text-fg sm:text-4xl"
      >
        {section.title}
      </h2>
      <p class="mt-4 text-lg leading-relaxed text-pretty text-fg-muted"><Inline text={section.lead} /></p>
      <ul class="mt-8 space-y-3.5">
        {#each section.points as point (point)}
          <li class="flex gap-3 text-[0.95rem] leading-relaxed text-pretty text-fg-muted">
            <Icon name="check" size={18} class="mt-0.5 shrink-0 text-coral-400" />
            <span><Inline text={point} /></span>
          </li>
        {/each}
      </ul>
    </div>
    <div class="min-w-0 lg:col-span-7" {@attach reveal(VISUAL_DELAY_MS)}>
      <FeatureVisual visual={section.visual} />
    </div>
  </div>

  {#if section.reference === 'binding-syntax'}
    <div class="mt-16" {@attach reveal()}>
      <BindingSyntax />
    </div>
  {/if}
</section>
