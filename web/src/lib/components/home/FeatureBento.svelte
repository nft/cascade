<script lang="ts">
  import Container from '$components/ui/Container.svelte'
  import SectionHeading from '$components/ui/SectionHeading.svelte'
  import { BENTO, BENTO_INTRO, type BentoSize } from '$content/home'
  import { reveal } from '$lib/motion/reveal'
  import BentoCard from './BentoCard.svelte'
  import SharingCard from './SharingCard.svelte'

  // A six-column grid: the large card takes four columns and two rows beside
  // two small ones, two halves share the next row, and the full card closes it.
  const PLACEMENT: Record<BentoSize, string> = {
    large: 'md:col-span-2 lg:col-span-4 lg:row-span-2',
    small: 'lg:col-span-2',
    half: 'lg:col-span-3',
    full: 'md:col-span-2 lg:col-span-6',
  }
  const STAGGER_MS = 60
</script>

<section class="py-24 sm:py-32">
  <Container>
    <div {@attach reveal()}>
      <SectionHeading title={BENTO_INTRO.title}>{BENTO_INTRO.body}</SectionHeading>
    </div>

    <div class="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6">
      {#each BENTO as item, index (item.id)}
        <div class="flex {PLACEMENT[item.size]}" {@attach reveal(index * STAGGER_MS)}>
          {#if item.shot}
            <BentoCard {item} class="w-full" />
          {:else}
            <SharingCard {item} class="w-full" />
          {/if}
        </div>
      {/each}
    </div>
  </Container>
</section>
