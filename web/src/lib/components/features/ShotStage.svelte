<script lang="ts">
  import { naturalSizes, naturalWidth, type Screenshot } from '$lib/screenshots'

  // A screenshot crop floating on the app's dot grid, never scaled past the
  // size it was captured at.
  let { shot, alt }: { shot: Screenshot; alt: string } = $props()
</script>

<div
  class="grid place-items-center overflow-hidden rounded-3xl border border-white/8 bg-app-canvas bg-dots p-5 [--dot:var(--color-app-dot)] sm:p-10"
>
  <div
    class="w-full max-w-(--shot-w) overflow-hidden rounded-xl shadow-window [&>picture]:block"
    style:--shot-w="{naturalWidth(shot)}px"
  >
    <enhanced:img src={shot} sizes={naturalSizes(shot)} {alt} class="block h-auto w-full" />
  </div>
</div>
