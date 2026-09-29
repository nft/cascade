<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import type { DocSection } from '$content/docs'
  import DocBlock from './DocBlock.svelte'

  let { section }: { section: DocSection } = $props()
</script>

{#snippet anchor(id: string, title: string)}
  <a href="#{id}" class="group/anchor inline-flex items-center gap-2 hover:text-fg">
    {title}
    <Icon
      name="link"
      size={18}
      class="text-fg-faint opacity-0 transition-opacity group-hover/anchor:opacity-100 group-focus-visible/anchor:opacity-100"
    />
  </a>
{/snippet}

<section
  id={section.id}
  aria-labelledby="{section.id}-title"
  class="scroll-mt-16 border-t border-white/6 py-12 first:scroll-mt-24 first:border-t-0 first:pt-0"
>
  <h2 id="{section.id}-title" class="text-2xl leading-tight font-semibold tracking-[-0.025em] text-balance text-fg sm:text-[1.75rem]">
    {@render anchor(section.id, section.title)}
  </h2>
  <div class="mt-5 space-y-5">
    {#each section.blocks as block, index (index)}
      <DocBlock {block} />
    {/each}
  </div>

  {#each section.subsections ?? [] as subsection (subsection.id)}
    <h3 id={subsection.id} class="mt-10 scroll-mt-24 text-lg font-semibold tracking-tight text-fg">
      {@render anchor(subsection.id, subsection.title)}
    </h3>
    <div class="mt-4 space-y-5">
      {#each subsection.blocks as block, index (index)}
        <DocBlock {block} />
      {/each}
    </div>
  {/each}
</section>
