<script lang="ts">
  import Icon from '$components/ui/Icon.svelte'
  import Inline from '$components/ui/Inline.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { INSTALL, INSTALL_GUIDES } from '$content/download'
  import { ANCHORS } from '$lib/config/routes'
  import { PLATFORMS } from '$lib/release/platforms'
</script>

<section aria-labelledby={ANCHORS.install} class="scroll-mt-24">
  <SectionHeading id={ANCHORS.install} title={INSTALL.title}>{INSTALL.lead}</SectionHeading>
  <div class="mt-10 grid gap-4 lg:grid-cols-3">
    {#each INSTALL_GUIDES as guide (guide.platform)}
      <article class="rounded-3xl border border-white/8 bg-surface p-6 sm:p-7">
        <h3 class="flex items-center gap-2.5 font-semibold text-fg">
          <Icon name={PLATFORMS[guide.platform].icon} size={20} class="text-fg-subtle" />
          {PLATFORMS[guide.platform].name}
        </h3>
        <ol class="mt-5 space-y-4">
          {#each guide.steps as step, index (step)}
            <li class="flex gap-3.5 text-[0.95rem] leading-relaxed text-pretty text-fg-muted">
              <span
                class="grid size-6 shrink-0 place-items-center rounded-full bg-white/6 font-mono text-xs font-semibold text-fg-subtle"
                >{index + 1}</span
              >
              <span class="min-w-0 [overflow-wrap:anywhere]"><Inline text={step} /></span>
            </li>
          {/each}
        </ol>
      </article>
    {/each}
  </div>
</section>
