import type { Attachment } from 'svelte/attachments'

const OFFSET_PX = 18
const DURATION_MS = 700
const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)'
const VISIBLE_THRESHOLD = 0.12
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

export function prefersReducedMotion(): boolean {
  return matchMedia(REDUCED_MOTION).matches
}

/**
 * Fades an element up the first time it scrolls into view. The prerendered
 * HTML shows everything; the effect only arms for elements still below the
 * fold when the page hydrates, so nothing already on screen blinks out, and
 * it stays off for visitors who ask for reduced motion.
 */
export function reveal(delayMs = 0): Attachment<HTMLElement> {
  return (element) => {
    if (prefersReducedMotion()) return
    if (element.getBoundingClientRect().top < window.innerHeight) return

    element.style.opacity = '0'
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        element.style.opacity = ''
        element.animate(
          [
            { opacity: 0, transform: `translateY(${OFFSET_PX}px)` },
            { opacity: 1, transform: 'none' },
          ],
          { duration: DURATION_MS, delay: delayMs, easing: EASE_OUT, fill: 'backwards' },
        )
      },
      { threshold: VISIBLE_THRESHOLD },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }
}

/** Calls `onVisible` once, the first time the element is mostly in view. */
export function onceVisible(onVisible: () => void, threshold = VISIBLE_THRESHOLD): Attachment<HTMLElement> {
  return (element) => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        onVisible()
      },
      { threshold },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }
}
