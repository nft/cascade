// Screenshots of the app, captured at 2x in its browser mode against the demo
// project it seeds on first launch. `?enhanced` builds AVIF, WebP and a
// fallback of each at build time, at the widths below.

/** What `<enhanced:img src>` takes: a srcset per format and a fallback image. */
export interface Screenshot {
  sources: Record<string, string>
  img: { src: string; w: number; h: number }
}

// Explicit widths make width descriptors. Without them enhanced-img asks for
// 1x/2x density descriptors, which vite-imagetools drops whenever it serves an
// image from its cache, so the server and client renders disagreed. Widths
// above a capture's own are clamped to it; 2880 is the widest capture.
const CAPTURES = import.meta.glob<Screenshot>('/src/lib/assets/screenshots/*.webp', {
  eager: true,
  import: 'default',
  query: '?enhanced&w=480;960;1440;1920;2880',
})

const CAPTURE_DIR = '/src/lib/assets/screenshots/'
const CAPTURE_EXT = '.webp'

/** Device pixels per CSS pixel in every capture. */
export const CAPTURE_SCALE = 2

function capture(name: string): Screenshot {
  const shot = CAPTURES[`${CAPTURE_DIR}${name}${CAPTURE_EXT}`]
  if (!shot) throw new Error(`No screenshot ${name}${CAPTURE_EXT} in ${CAPTURE_DIR}`)
  return shot
}

export const WORKSPACE_SHOT = capture('workspace')

/** Crops of single panels and nodes, by what they show. */
export const SHOTS = {
  binding: capture('binding'),
  credential: capture('credential'),
  environments: capture('environments'),
  failure: capture('failure'),
  inspector: capture('inspector'),
  loop: capture('loop'),
  transform: capture('transform'),
}

export type ShotId = keyof typeof SHOTS

/** The width a shot was captured at, in CSS pixels; wider than this it blurs. */
export function naturalWidth(shot: Screenshot): number {
  return shot.img.w / CAPTURE_SCALE
}

/** A `sizes` value for a shot shown no wider than it was captured. */
export function naturalSizes(shot: Screenshot): string {
  return `min(${naturalWidth(shot)}px, 100vw)`
}
