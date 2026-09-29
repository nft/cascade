<script lang="ts">
  import { resolve } from '$app/paths'
  import FeatureNav from '$components/features/FeatureNav.svelte'
  import FeatureSection from '$components/features/FeatureSection.svelte'
  import GetCascade from '$components/home/GetCascade.svelte'
  import Seo from '$components/layout/Seo.svelte'
  import DownloadButton from '$components/release/DownloadButton.svelte'
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import LinkButton, { ICON_SIZE } from '$components/ui/LinkButton.svelte'
  import PageHeader from '$components/ui/PageHeader.svelte'
  import { FEATURE_SECTIONS, FEATURES_PAGE } from '$content/features'
  import { ROUTES } from '$lib/config/routes'
  import { scrollSpy } from '$lib/motion/scrollSpy'

  let { data } = $props()

  let current = $state<string | null>(null)
</script>

<Seo title={FEATURES_PAGE.title} description={FEATURES_PAGE.description} />

<PageHeader title={FEATURES_PAGE.title} lead={FEATURES_PAGE.lead}>
  <DownloadButton release={data.release} class="sm:min-w-[16.5rem]" />
  <LinkButton href={resolve(ROUTES.docs)} variant="secondary" size="lg">
    <Icon name="description" size={ICON_SIZE.lg} />
    Read the docs
  </LinkButton>
</PageHeader>

<!-- The nav sticks only while the sections scroll past. -->
<div>
  <FeatureNav sections={FEATURE_SECTIONS} {current} />
  <Container>
    <div {@attach scrollSpy('section[id]', (id) => (current = id))}>
      {#each FEATURE_SECTIONS as section, index (section.id)}
        <FeatureSection {section} flip={index % 2 === 1} />
      {/each}
    </div>
  </Container>
</div>

<GetCascade release={data.release} />
