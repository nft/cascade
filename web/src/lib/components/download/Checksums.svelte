<script lang="ts">
  import CommandBlock from '$components/ui/CommandBlock.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { CHECKSUM_COMMANDS, CHECKSUMS } from '$content/download'
  import { ANCHORS } from '$lib/config/routes'
</script>

<section aria-labelledby={ANCHORS.checksums} class="scroll-mt-24">
  <SectionHeading id={ANCHORS.checksums} title={CHECKSUMS.title}><Inline text={CHECKSUMS.lead} /></SectionHeading>
  <div class="mt-10 grid gap-4">
    {#each CHECKSUM_COMMANDS as set (set.label)}
      <CommandBlock label={set.label} lines={set.lines} />
    {/each}
  </div>
</section>
