<script lang="ts">
  import BuildFromSource from '$components/download/BuildFromSource.svelte'
  import Checksums from '$components/download/Checksums.svelte'
  import InstallGuides from '$components/download/InstallGuides.svelte'
  import ReleaseStatus from '$components/download/ReleaseStatus.svelte'
  import Seo from '$components/layout/Seo.svelte'
  import PlatformCard from '$components/release/PlatformCard.svelte'
  import Container from '$components/ui/Container.svelte'
  import PageHeader from '$components/ui/PageHeader.svelte'
  import { DOWNLOAD_HELP, DOWNLOAD_PAGE } from '$content/download'
  import { LINKS } from '$lib/config/site'
  import { detectedPlatform } from '$lib/release/detected.svelte'
  import { PLATFORM_IDS, PLATFORMS } from '$lib/release/platforms'

  let { data } = $props()

  const detected = detectedPlatform()
</script>

<Seo title={DOWNLOAD_PAGE.title} description={DOWNLOAD_PAGE.description} />

<PageHeader title={DOWNLOAD_PAGE.title} lead={DOWNLOAD_PAGE.lead} />

<Container class="space-y-24 py-14 sm:space-y-32 sm:py-20">
  <div>
    <ReleaseStatus release={data.release} />
    <div class="mt-6 grid gap-4 md:grid-cols-3">
      {#each PLATFORM_IDS as id (id)}
        <PlatformCard platform={PLATFORMS[id]} release={data.release} detected={detected.current === id} detailed />
      {/each}
    </div>
  </div>

  <InstallGuides />
  <Checksums />
  <BuildFromSource />

  <p class="text-fg-muted">
    {DOWNLOAD_HELP.text}
    <a href={LINKS.newIssue} target="_blank" rel="noopener" class="font-semibold text-coral-300 hover:text-coral-200"
      >{DOWNLOAD_HELP.link}</a
    >.
  </p>
</Container>
