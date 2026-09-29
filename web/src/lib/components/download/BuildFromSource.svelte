<script lang="ts">
  import CommandBlock from '$components/ui/CommandBlock.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { BUILD_FROM_SOURCE } from '$content/download'
  import { ANCHORS } from '$lib/config/routes'
</script>

<section aria-labelledby={ANCHORS.buildFromSource} class="scroll-mt-24">
  <SectionHeading id={ANCHORS.buildFromSource} title={BUILD_FROM_SOURCE.title}>{BUILD_FROM_SOURCE.lead}</SectionHeading>
  <ul class="mt-8 max-w-3xl space-y-3">
    {#each BUILD_FROM_SOURCE.toolchains as toolchain (toolchain)}
      <li
        class="relative pl-5 leading-relaxed text-pretty text-fg-muted before:absolute before:top-[0.7em] before:left-0 before:size-1.5 before:rounded-full before:bg-coral-400"
      >
        <Inline text={toolchain} />
      </li>
    {/each}
  </ul>
  <div class="mt-8">
    <CommandBlock lines={BUILD_FROM_SOURCE.commands} />
  </div>
</section>
