// The update flow's state: one check at a time, one release in hand, one
// download in flight. Go does the work (app_update.go); this store decides
// what the user sees and remembers what they chose.
import { api as liveApi, type UpdateApi } from './api'
import { dialogs } from './dialogs.svelte'
import { settings as liveSettings, type SettingsState } from './settings.svelte'
import {
  BROWSER_APP_INFO,
  InstallKind,
  UpdateStatus,
  type AppInfo,
  type UpdatePlan,
  type UpdateProgress,
  type UpdateRelease,
} from './updates'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'unsupported'
  | 'downloading'
  | 'ready'
  | 'installing'
  | 'failed'

/** The launch check waits for the project to load and the window to settle. */
export const STARTUP_CHECK_DELAY_MS = 4000

/** Error text when the Go side throws something that is not an Error. */
const UNKNOWN_ERROR = 'something went wrong'
/** Cancelling a download surfaces as this from Go's context; it is not a failure. */
const CANCELLED_MARKER = 'context canceled'

export interface UpdateDeps {
  api: UpdateApi
  settings: Pick<SettingsState, 'checkForUpdates' | 'skippedUpdate' | 'update'>
}

export class UpdatesState {
  phase = $state<UpdatePhase>('idle')
  info = $state<AppInfo>(BROWSER_APP_INFO)
  release = $state<UpdateRelease | null>(null)
  plan = $state<UpdatePlan | null>(null)
  /** Why installing from here cannot work; '' when it can. */
  installBlocker = $state('')
  progress = $state<UpdateProgress | null>(null)
  error = $state('')
  /** Later was chosen: the pill stays away until the next launch or a manual check. */
  dismissed = $state(false)
  /** Whether the running or last check was asked for by the user. */
  manual = $state(false)

  readonly #deps: UpdateDeps
  #cancelling = false

  constructor(deps: UpdateDeps = { api: liveApi, settings: liveSettings }) {
    this.#deps = deps
  }

  /** A newer version the user has not dismissed, worth a top-bar pill. */
  get pending(): boolean {
    return (this.phase === 'available' || this.phase === 'ready') && !this.dismissed && this.release !== null
  }

  /** Download progress as 0..1, or null before the total is known. */
  get fraction(): number | null {
    if (!this.progress || this.progress.total <= 0) return null
    return Math.min(1, this.progress.done / this.progress.total)
  }

  /** The action the install button performs here. */
  get installLabel(): string {
    return this.plan?.kind === InstallKind.RunInstaller ? 'Run installer' : 'Install and relaunch'
  }

  async loadInfo(): Promise<void> {
    this.info = await this.#deps.api.appInfo()
  }

  /** Schedules the launch check when the setting allows; returns the cancel. */
  scheduleStartupCheck(delayMs = STARTUP_CHECK_DELAY_MS): () => void {
    if (!this.#deps.settings.checkForUpdates) return () => {}
    const timer = setTimeout(() => void this.check({ manual: false }), delayMs)
    return () => clearTimeout(timer)
  }

  /** Asks Go for the newest release. A launch check stays quiet about a skipped version. */
  async check({ manual }: { manual: boolean }): Promise<void> {
    if (this.phase === 'checking' || this.phase === 'downloading' || this.phase === 'installing') return
    this.manual = manual
    this.phase = 'checking'
    this.error = ''
    try {
      const result = await this.#deps.api.checkForUpdate()
      this.apply(result.status, result.release ?? null, result.plan ?? null, result.installBlocker ?? '')
    } catch (e) {
      this.fail(e)
    }
  }

  private apply(status: UpdateStatus, release: UpdateRelease | null, plan: UpdatePlan | null, blocker: string) {
    this.release = release
    this.plan = plan
    this.installBlocker = blocker
    this.progress = null
    const skipped = release !== null && !this.manual && release.tag === this.#deps.settings.skippedUpdate
    if (status === UpdateStatus.UpToDate || skipped) {
      this.phase = 'upToDate'
      return
    }
    this.dismissed = false
    this.phase = status === UpdateStatus.Available ? 'available' : 'unsupported'
  }

  /** Downloads and verifies the release in hand; progress arrives over the event stream. */
  async download(): Promise<void> {
    const release = this.release
    if (!release || this.phase !== 'available' || this.installBlocker) return
    this.phase = 'downloading'
    this.error = ''
    this.#cancelling = false
    this.progress = { tag: release.tag, done: 0, total: release.assetSize ?? -1 }
    const stop = this.#deps.api.onUpdateProgress((p) => {
      if (p.tag === release.tag) this.progress = p
    })
    try {
      await this.#deps.api.downloadUpdate(release.tag)
      this.phase = 'ready'
    } catch (e) {
      if (this.#cancelling) this.phase = 'available'
      else this.fail(e)
    } finally {
      stop()
      this.#cancelling = false
    }
  }

  async cancelDownload(): Promise<void> {
    if (this.phase !== 'downloading') return
    this.#cancelling = true
    await this.#deps.api.cancelUpdateDownload()
  }

  /** Applies the verified package; Cascade quits from the Go side once it has. */
  async install(): Promise<void> {
    if (this.phase !== 'ready') return
    this.phase = 'installing'
    this.error = ''
    try {
      this.plan = await this.#deps.api.installUpdate()
    } catch (e) {
      this.fail(e)
    }
  }

  /** Never mention this release again on a launch check. */
  skip(): void {
    if (this.release) this.#deps.settings.update({ skippedUpdate: this.release.tag })
    this.later()
  }

  /** Hide the pill until the next launch. */
  later(): void {
    this.dismissed = true
    dialogs.update = false
  }

  openDialog(): void {
    dialogs.update = true
  }

  /** Closing without choosing keeps the pill; Later is the explicit dismissal. */
  closeDialog(): void {
    dialogs.update = false
  }

  /** A failed download or install goes back to offering the release. */
  retry(): void {
    if (this.phase !== 'failed') return
    this.error = ''
    this.phase = this.release ? 'available' : 'idle'
  }

  openReleasePage(): void {
    void this.#deps.api.openExternal(this.release?.url ?? this.info.releasesUrl)
  }

  private fail(e: unknown) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : UNKNOWN_ERROR
    if (message.includes(CANCELLED_MARKER) && this.release) {
      this.phase = 'available'
      return
    }
    this.error = message
    this.phase = 'failed'
  }
}

export const updates = new UpdatesState()
