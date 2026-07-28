import { ae } from '@aeroapp/ae'
import { AE, COPY_FEEDBACK_MS, COPY_LABEL, DATASET } from './constants'

/**
 * Copy-to-clipboard for the install command.
 *
 * The text to copy travels on the button's `data-clipboard` attribute so the
 * command itself stays in the content model and is never duplicated in script.
 */
export function initCopy(): void {
  const label = ae.signal<string>(COPY_LABEL.idle)
  let revert: ReturnType<typeof setTimeout> | undefined

  ae(AE.copyLabel).text(label)

  ae(AE.copyInstall).press((el) => {
    const text = (el as HTMLElement).dataset[DATASET.clipboard]
    if (text === undefined || text === '') return

    void writeClipboard(text).then((ok) => {
      label.value = ok ? COPY_LABEL.done : COPY_LABEL.failed
      clearTimeout(revert)
      revert = setTimeout(() => {
        label.value = COPY_LABEL.idle
      }, COPY_FEEDBACK_MS)
    })
  })
}

/** Resolves false rather than throwing when the clipboard is unavailable —
 * `navigator.clipboard` is undefined outside a secure context. */
async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
