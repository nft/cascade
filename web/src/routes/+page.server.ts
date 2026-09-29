import { latestChangelogRelease } from '$lib/server/changelog'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = () => ({ latest: latestChangelogRelease() })
