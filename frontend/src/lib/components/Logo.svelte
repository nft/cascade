<script lang="ts">
  // The brace-and-link mark from logos/cascade-schema-symbol.svg. The viewBox
  // is the artwork's bounds including half the brace stroke, so the mark sits
  // flush with its box; width derives from the requested height so the mark
  // never distorts.
  const VIEWBOX_X = 10.5
  const VIEWBOX_Y = 13.5
  const VIEWBOX_WIDTH = 75
  const VIEWBOX_HEIGHT = 69
  const BRACE_STROKE = 7
  const LINK_STROKE = 6
  const NODE_RADIUS = 6

  let { size = 20, class: cls = '' }: { size?: number; class?: string } = $props()
</script>

<svg
  viewBox="{VIEWBOX_X} {VIEWBOX_Y} {VIEWBOX_WIDTH} {VIEWBOX_HEIGHT}"
  height={size}
  width={(size * VIEWBOX_WIDTH) / VIEWBOX_HEIGHT}
  role="img"
  aria-label="Cascade"
  class={cls}
>
  <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path
      stroke-width={BRACE_STROKE}
      d="M34 17H29Q21 17 21 25V36Q21 44 14 48Q21 52 21 60V71Q21 79 29 79H34M62 17H67Q75 17 75 25V36Q75 44 82 48Q75 52 75 60V71Q75 79 67 79H62"
    />
    <path stroke-width={LINK_STROKE} d="M42 42L55 55" />
  </g>
  <circle cx="40" cy="40" r={NODE_RADIUS} fill="currentColor" />
  <circle cx="57" cy="57" r={NODE_RADIUS} fill="currentColor" />
</svg>
