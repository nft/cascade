<script lang="ts">
  import { resolve } from '$app/paths'
  import CodeBlock from '$components/ui/CodeBlock.svelte'
  import CommandBlock from '$components/ui/CommandBlock.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import type { DocBlock, NoteTone } from '$content/docs'
  import type { IconName } from '$lib/icons'
  import DocTable from './DocTable.svelte'

  let { block }: { block: DocBlock } = $props()

  const NOTE_STYLE: Record<NoteTone, { icon: IconName; box: string; iconClass: string }> = {
    info: { icon: 'info', box: 'border-white/8 bg-white/3', iconClass: 'text-fg-subtle' },
    warning: { icon: 'warning', box: 'border-coral-500/25 bg-coral-500/6', iconClass: 'text-coral-400' },
  }
</script>

{#if block.kind === 'text'}
  <p class="leading-relaxed text-pretty text-fg-muted"><Inline text={block.text} /></p>
{:else if block.kind === 'steps'}
  <ol class="space-y-3.5">
    {#each block.items as item, index (item)}
      <li class="flex gap-3.5 leading-relaxed text-pretty text-fg-muted">
        <span
          class="mt-px grid size-6 shrink-0 place-items-center rounded-full bg-white/6 font-mono text-xs font-semibold text-fg-subtle"
          >{index + 1}</span
        >
        <span class="min-w-0 [overflow-wrap:anywhere]"><Inline text={item} /></span>
      </li>
    {/each}
  </ol>
{:else if block.kind === 'list'}
  <ul class="space-y-2.5">
    {#each block.items as item (item)}
      <li class="flex gap-3 leading-relaxed text-pretty text-fg-muted">
        <span aria-hidden="true" class="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-coral-400/70"></span>
        <span class="min-w-0 [overflow-wrap:anywhere]"><Inline text={item} /></span>
      </li>
    {/each}
  </ul>
{:else if block.kind === 'shell'}
  <CommandBlock lines={block.lines} />
{:else if block.kind === 'code'}
  <CodeBlock lines={block.lines} label={block.label} />
{:else if block.kind === 'table'}
  <DocTable head={block.head} rows={block.rows} />
{:else if block.kind === 'links'}
  <ul class="flex flex-wrap gap-2.5">
    {#each block.items as link (link.label)}
      <li>
        <a
          href="{resolve(link.href)}{link.hash ? `#${link.hash}` : ''}"
          class="group inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/3 py-1.5 pr-3 pl-4 text-sm font-semibold text-fg transition-colors hover:border-coral-400/40 hover:bg-coral-500/8"
        >
          {link.label}
          <Icon name="arrow_forward" size={16} class="text-coral-400 transition-transform group-hover:translate-x-0.5" />
        </a>
      </li>
    {/each}
  </ul>
{:else}
  {@const style = NOTE_STYLE[block.tone]}
  <aside class="flex gap-3 rounded-2xl border p-4 {style.box}">
    <Icon name={style.icon} size={20} class="mt-0.5 shrink-0 {style.iconClass}" />
    <p class="leading-relaxed text-pretty text-fg-muted"><Inline text={block.text} /></p>
  </aside>
{/if}
