import { ae } from '@aeroapp/ae'
import { AE } from './constants'

/**
 * Mobile navigation disclosure.
 *
 * The panel ships with the `hidden` attribute set, so the closed state is
 * correct before any script runs.
 */
export function initNav(): void {
  const open = ae.signal(false)

  ae(AE.navToggle)
    .press(() => {
      open.value = !open.value
    })
    .attr('aria-expanded', () => String(open.value))

  ae(AE.navPanel)
    // `.attr` removes on null and sets on true, which is exactly the semantics
    // of a boolean attribute like `hidden`.
    .attr('hidden', () => (open.value ? null : true))
    .mount((el) => {
      // Following an in-page link leaves the panel covering the target.
      const close = (event: Event) => {
        if ((event.target as Element | null)?.closest('a')) open.value = false
      }
      el.addEventListener('click', close)
      return () => el.removeEventListener('click', close)
    })
}
