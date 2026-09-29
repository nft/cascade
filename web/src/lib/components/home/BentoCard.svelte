<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import type { BentoItem, BentoSize } from '$content/home'
  import { naturalSizes, SHOTS } from '$lib/screenshots'

  // A feature with a screenshot crop tucked into the card's corner.
  let { item, class: cls = '' }: { item: BentoItem; class?: string } = $props()

  // The large card's shot fills whatever height its two rows give it; the
  // others keep the proportions their crops were cut at.
  const SHOT_BOX: Record<BentoSize, string> = {
    large: 'lg:min-h-0 lg:flex-1',
    small: 'aspect-[1.56]',
    half: 'aspect-[1.7]',
    full: '',
  }

  const shot = $derived(item.shot ? SHOTS[item.shot] : null)
</script>

<article
  class="flex flex-col overflow-hidden rounded-3xl border border-white/8 bg-surface shadow-card transition-colors hover:border-white/14 {cls}"
>
  <div class="p-6 sm:p-8">
    <Icon name={item.icon} size={22} class="text-coral-400" />
    <h3 class="mt-4 text-lg font-semibold tracking-tight text-fg">{item.title}</h3>
    <p class="mt-2 max-w-md text-[0.95rem] leading-relaxed text-pretty text-fg-muted"><Inline text={item.body} /></p>
  </div>
  {#if shot}
    <div
      class="mt-auto ml-6 overflow-hidden rounded-tl-xl border-t border-l border-white/10 bg-app-canvas sm:ml-8 [&>picture]:block [&>picture]:h-full {SHOT_BOX[
        item.size
      ]}"
    >
      <enhanced:img
        src={shot}
        sizes={naturalSizes(shot)}
        alt={item.alt ?? ''}
        class="block h-full w-full object-cover object-top-left"
      />
    </div>
  {/if}
</article>
