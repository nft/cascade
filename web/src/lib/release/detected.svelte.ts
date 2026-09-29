import { onMount } from 'svelte'
import { detectPlatform } from './detect'
import type { PlatformId } from './platforms'

/**
 * The visitor's desktop platform, known only after hydration: prerendered
 * HTML cannot know it, so it starts null. Call during component setup.
 */
export function detectedPlatform(): { readonly current: PlatformId | null } {
  let current = $state<PlatformId | null>(null)
  onMount(() => {
    current = detectPlatform(navigator)
  })
  return {
    get current() {
      return current
    },
  }
}
