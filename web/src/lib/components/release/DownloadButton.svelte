<script lang="ts">
  import { resolve } from '$app/paths'
  import Icon from '$components/ui/Icon.svelte'
  import LinkButton, { ICON_SIZE, type ButtonSize } from '$components/ui/LinkButton.svelte'
  import { ROUTES } from '$lib/config/routes'
  import { detectedPlatform } from '$lib/release/detected.svelte'
  import { PLATFORMS, primaryDownloadUrl, type ReleaseState } from '$lib/release/platforms'

  // Prerendered as a plain link to the download page; once hydrated it names
  // the visitor's platform and, when a release carries its file, links the
  // file itself. Give it a min width where the label change could shift
  // neighbours.
  let {
    release,
    size = 'lg',
    class: cls = '',
  }: { release: ReleaseState; size?: ButtonSize; class?: string } = $props()

  const detected = detectedPlatform()
  const platform = $derived(detected.current)
  const direct = $derived(platform ? primaryDownloadUrl(release, platform) : null)
  const href = $derived(
    direct ?? (platform ? `${resolve(ROUTES.download)}#${platform}` : resolve(ROUTES.download)),
  )
  const label = $derived(platform ? `Download for ${PLATFORMS[platform].name}` : 'Download')
</script>

<LinkButton {href} variant="primary" {size} class={cls}>
  <Icon name="download" size={ICON_SIZE[size]} />
  {label}
</LinkButton>
