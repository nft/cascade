<script lang="ts">
  import FeatureBento from '$components/home/FeatureBento.svelte'
  import GetCascade from '$components/home/GetCascade.svelte'
  import Hero from '$components/home/Hero.svelte'
  import LatestRelease from '$components/home/LatestRelease.svelte'
  import LocalFirst from '$components/home/LocalFirst.svelte'
  import ScriptToBoard from '$components/home/ScriptToBoard.svelte'
  import Workspace from '$components/home/Workspace.svelte'
  import Seo from '$components/layout/Seo.svelte'

  let { data } = $props()
</script>

<Seo />

<Hero release={data.release} latest={data.latest} />
<ScriptToBoard />
<Workspace />
<FeatureBento />
<LocalFirst />
{#if data.latest}
  <LatestRelease latest={data.latest} />
{/if}
<GetCascade release={data.release} />
