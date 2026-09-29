<script lang="ts">
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { LOCAL, LOCAL_POINTS } from '$content/home'
  import { reveal } from '$lib/motion/reveal'

  const STAGGER_MS = 70
</script>

<section class="border-y border-white/6 bg-surface/50 py-24 sm:py-32">
  <Container class="grid gap-14 lg:grid-cols-12 lg:gap-16">
    <div class="lg:col-span-5" {@attach reveal()}>
      <SectionHeading title={LOCAL.title}>{LOCAL.body}</SectionHeading>
    </div>

    <dl class="grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:col-span-7">
      {#each LOCAL_POINTS as point, index (point.title)}
        <div {@attach reveal(index * STAGGER_MS)}>
          <dt class="flex items-center gap-3.5 font-semibold text-fg">
            <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-navy ring-1 ring-white/8">
              <Icon name={point.icon} size={20} class="text-coral-400" />
            </span>
            {point.title}
          </dt>
          <dd class="mt-3.5 text-[0.95rem] leading-relaxed text-pretty text-fg-muted">{point.body}</dd>
        </div>
      {/each}
    </dl>
  </Container>
</section>
