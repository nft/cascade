<script lang="ts">
  // Download progress: a determinate bar once the size is known, a pulsing
  // segment until then. The width rides a CSS variable so Tailwind's scanner
  // sees a fixed class.
  import { formatBytes } from '../../format'
  import type { UpdateProgress } from '../../updates'

  let { progress, fraction }: { progress: UpdateProgress; fraction: number | null } = $props()

  const PERCENT = 100
  const percent = $derived(fraction === null ? null : Math.round(fraction * PERCENT))
  const label = $derived(
    progress.total > 0 ? `${formatBytes(progress.done)} of ${formatBytes(progress.total)}` : formatBytes(progress.done),
  )
</script>

<div>
  <div class="flex items-center justify-between text-[11px] text-zinc-400">
    <span>Downloading…</span>
    <span>{label}</span>
  </div>
  <div
    class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-800"
    role="progressbar"
    aria-label="Download progress"
    aria-valuemin="0"
    aria-valuemax={PERCENT}
    aria-valuenow={percent ?? undefined}
  >
    {#if percent === null}
      <div class="h-full w-1/3 animate-pulse rounded-full bg-emerald-500"></div>
    {:else}
      <div class="h-full w-(--p) rounded-full bg-emerald-500 transition-[width]" style="--p:{percent}%"></div>
    {/if}
  </div>
</div>
