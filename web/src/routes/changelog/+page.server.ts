import { loadChangelog } from '$lib/server/changelog'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => ({ releases: loadChangelog() })
