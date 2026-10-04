// Update API used when the Wails runtime is absent (vitest, plain-browser
// dev): there is no release feed to ask and nothing to install, so a check
// comes back up to date and links open in a new tab. `?update=demo` on the
// dev URL fakes a newer release with a timed download, for working on the UI.
import type { UpdateApi } from './api'
import { BROWSER_APP_INFO, InstallKind, UpdateStatus, type UpdateCheck, type UpdateProgress } from './updates'

const NEW_TAB = '_blank'
const DEMO_QUERY_KEY = 'update'
const DEMO_QUERY_VALUE = 'demo'
const DEMO_TAG = 'v9.9.9'
const DEMO_SIZE = 42_000_000
const DEMO_TICKS = 20
const DEMO_TICK_MS = 120

const DEMO_RELEASE: UpdateCheck = {
  status: UpdateStatus.Available,
  release: {
    version: '9.9.9',
    tag: DEMO_TAG,
    notes: '### Added\n\n- A fake release for working on the update dialog.\n- Nothing here is real, including `9.9.9`.\n',
    url: `${BROWSER_APP_INFO.releasesUrl}/tag/${DEMO_TAG}`,
    publishedAt: new Date().toISOString(),
    assetName: 'Cascade-macOS-universal.dmg',
    assetSize: DEMO_SIZE,
  },
  plan: { kind: InstallKind.ReplaceBundle, target: '/Applications/Cascade.app', relaunch: true },
}

function demoRequested(): boolean {
  if (typeof location === 'undefined') return false
  return new URLSearchParams(location.search).get(DEMO_QUERY_KEY) === DEMO_QUERY_VALUE
}

export function createInMemoryUpdateApi(): UpdateApi {
  const handlers = new Set<(p: UpdateProgress) => void>()
  return {
    async appInfo() {
      return BROWSER_APP_INFO
    },
    async checkForUpdate() {
      return demoRequested() ? DEMO_RELEASE : { status: UpdateStatus.UpToDate }
    },
    async downloadUpdate(tag) {
      if (!demoRequested()) throw new Error('no update to download outside the app')
      for (let tick = 1; tick <= DEMO_TICKS; tick++) {
        await new Promise((resolve) => setTimeout(resolve, DEMO_TICK_MS))
        const done = Math.round((DEMO_SIZE * tick) / DEMO_TICKS)
        handlers.forEach((handler) => handler({ tag, done, total: DEMO_SIZE }))
      }
    },
    async cancelUpdateDownload() {},
    async installUpdate() {
      if (!demoRequested()) throw new Error('no update to install outside the app')
      return DEMO_RELEASE.plan!
    },
    async openExternal(url) {
      if (typeof window !== 'undefined') window.open(url, NEW_TAB, 'noopener')
    },
    onUpdateProgress(handler) {
      handlers.add(handler)
      return () => handlers.delete(handler)
    },
  }
}
