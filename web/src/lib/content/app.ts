// Facts about the desktop app that more than one page states. Each mirrors a
// constant in the app's Go code, named beside it.
import type { PlatformId } from '$lib/release/platforms'

/**
 * Where the app keeps its projects: os.UserConfigDir() joined with
 * appDataDirName (main.go).
 */
export const DATA_DIRS: Record<PlatformId, string> = {
  macos: '~/Library/Application Support/cascade',
  windows: '%AppData%\\cascade',
  linux: '~/.config/cascade',
}

/** The OS keychain service credentials are filed under (store/secrets_keychain.go). */
export const KEYCHAIN_SERVICE = 'cascade'
