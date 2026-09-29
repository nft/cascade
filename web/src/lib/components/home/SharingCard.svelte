<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import JsonBlock from '$components/ui/JsonBlock.svelte'
  import { BOARD_FILE } from '$content/boardFile'
  import type { BentoItem } from '$content/home'
  import { LINKS } from '$lib/config/site'

  // The bento's closing row: the board file itself instead of a screenshot.
  let { item, class: cls = '' }: { item: BentoItem; class?: string } = $props()
</script>

<article
  class="grid overflow-hidden rounded-3xl border border-white/8 bg-surface shadow-card transition-colors hover:border-white/14 lg:grid-cols-[2fr_3fr] {cls}"
>
  <div class="flex flex-col p-6 sm:p-8">
    <Icon name={item.icon} size={22} class="text-coral-400" />
    <h3 class="mt-4 text-lg font-semibold tracking-tight text-fg">{item.title}</h3>
    <p class="mt-2 max-w-md text-[0.95rem] leading-relaxed text-pretty text-fg-muted"><Inline text={item.body} /></p>
    <a
      href={LINKS.formatSpec}
      target="_blank"
      rel="noopener"
      class="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-coral-300 hover:text-coral-200 lg:mt-auto"
    >
      Read the format spec
      <Icon name="arrow_outward" size={16} />
    </a>
  </div>
  <JsonBlock
    name={BOARD_FILE.name}
    lines={BOARD_FILE.lines}
    class="border-t border-white/8 lg:border-t-0 lg:border-l"
  />
</article>
