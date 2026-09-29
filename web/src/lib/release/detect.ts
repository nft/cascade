import type { PlatformId } from './platforms'

/** The parts of `navigator` platform detection reads; injectable for tests. */
export interface NavigatorLike {
  userAgent: string
  maxTouchPoints?: number
  userAgentData?: { platform?: string; mobile?: boolean }
}

const MOBILE_RE = /Android|iPhone|iPad|iPod|Mobile/i
const MAC_RE = /Mac/i
// Case-sensitive on purpose: /win/i would match "Darwin".
const WINDOWS_RE = /Windows|Win32|Win64/
const LINUX_RE = /Linux|X11/i
const CHROME_OS_RE = /CrOS/i
// iPadOS asks for desktop sites with a Mac user agent; touch gives it away.
const IPAD_TOUCH_POINTS = 1

/**
 * The desktop platform the visitor is most likely on, or null for phones,
 * tablets and anything unrecognised, which get every platform shown equally.
 */
export function detectPlatform(nav: NavigatorLike): PlatformId | null {
  const hint = nav.userAgentData?.platform ?? ''
  const ua = nav.userAgent
  if (nav.userAgentData?.mobile || MOBILE_RE.test(ua)) return null

  const source = hint || ua
  if (MAC_RE.test(source)) return (nav.maxTouchPoints ?? 0) > IPAD_TOUCH_POINTS ? null : 'macos'
  if (WINDOWS_RE.test(source)) return 'windows'
  if (CHROME_OS_RE.test(ua)) return null
  if (LINUX_RE.test(source)) return 'linux'
  return null
}
