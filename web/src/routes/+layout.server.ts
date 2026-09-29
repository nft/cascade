import { latestRelease } from '$lib/server/github'
import type { LayoutServerLoad } from './$types'

// Every page is rendered to HTML at build time; there is no server.
export const prerender = true

export const load: LayoutServerLoad = async () => ({
  release: await latestRelease(),
})
