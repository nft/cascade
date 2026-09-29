<script lang="ts">
  import ReleaseEntry from '$components/changelog/ReleaseEntry.svelte'
  import Seo from '$components/layout/Seo.svelte'
  import Container from '$components/ui/Container.svelte'
  import Icon from '$components/ui/Icon.svelte'
  import LinkButton from '$components/ui/LinkButton.svelte'
  import PageHeader from '$components/ui/PageHeader.svelte'
  import { CHANGELOG_PAGE } from '$content/changelog'
  import { LINKS } from '$lib/config/site'

  let { data } = $props()

  const latest = $derived(data.releases.find((release) => !release.unreleased))
</script>

<Seo title={CHANGELOG_PAGE.title} description={CHANGELOG_PAGE.description} />

<PageHeader title={CHANGELOG_PAGE.title} lead={CHANGELOG_PAGE.lead}>
  <LinkButton href={LINKS.releasesFeed} variant="secondary" external>
    <Icon name="rss_feed" size={19} />
    Releases feed
  </LinkButton>
  <LinkButton href={LINKS.changelogSource} variant="ghost" external>
    CHANGELOG.md
    <Icon name="arrow_outward" size={17} />
  </LinkButton>
</PageHeader>

<Container class="py-10 sm:py-16">
  {#each data.releases as release (release.version)}
    <ReleaseEntry {release} latest={release === latest} />
  {:else}
    <p class="py-16 text-fg-muted">No releases yet.</p>
  {/each}
</Container>
