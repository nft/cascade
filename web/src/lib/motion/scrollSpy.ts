import type { Attachment } from 'svelte/attachments'

// A thin strip a third of the way down the viewport. The section crossing it
// is the one being read; sections sit edge to edge, so there is always one.
const READING_BAND = '-33% 0px -66% 0px'

/** Reports the id of each `selector` match inside the element as it becomes the one being read. */
export function scrollSpy(selector: string, onRead: (id: string) => void): Attachment<HTMLElement> {
  return (container) => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) onRead(entry.target.id)
      },
      { rootMargin: READING_BAND },
    )
    for (const section of container.querySelectorAll(selector)) observer.observe(section)
    return () => observer.disconnect()
  }
}
