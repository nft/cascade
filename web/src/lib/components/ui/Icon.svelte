<script lang="ts">
  import type { IconName } from '$lib/icons'

  // Material Symbols' optical-size axis spans 20–48; matching it to the
  // rendered size keeps strokes crisp at small sizes.
  const OPSZ_MIN = 20
  const OPSZ_MAX = 48

  let {
    name,
    size = 20,
    filled = false,
    class: cls = '',
  }: {
    name: IconName
    /** Pixels, or an em length for icons that scale with the text around them. */
    size?: number | `${number}em`
    filled?: boolean
    class?: string
  } = $props()

  const box = $derived(typeof size === 'number' ? `${size}px` : size)
  // An em size has no pixel value to match, and em icons here are small.
  const opsz = $derived(typeof size === 'number' ? Math.min(OPSZ_MAX, Math.max(OPSZ_MIN, size)) : OPSZ_MIN)
</script>

<!-- The box is fixed so the ligature text, invisible until the font loads,
     cannot shift layout. Google's stylesheet also defines a
     .material-symbols-rounded class, but it pins font-size to 24px outside
     any cascade layer, where it beats every utility, so the family comes
     from the font-symbols token instead. -->
<span
  aria-hidden="true"
  class="inline-block size-(--icon) shrink-0 overflow-hidden font-symbols text-(length:--icon) leading-none font-normal tracking-normal whitespace-nowrap normal-case not-italic select-none [font-variation-settings:'FILL'_var(--fill),'opsz'_var(--opsz)] {cls}"
  style:--icon={box}
  style:--fill={filled ? 1 : 0}
  style:--opsz={opsz}>{name}</span
>
