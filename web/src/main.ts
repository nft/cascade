import { initCopy } from './lib/copy'
import { initDemo } from './lib/demo'
import { initNav } from './lib/nav'

/**
 * Every binding below is attached by name and is a no-op on pages that do not
 * contain the matching elements, so one entry module serves the whole site.
 *
 * The stylesheet is linked from the document head rather than imported here:
 * it must not wait on JavaScript.
 */
initNav()
initCopy()
initDemo()
