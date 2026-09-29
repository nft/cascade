// Copy for the docs page, a user guide in one page. Every claim is checked
// against the app's code (core/, store/, share/, frontend/); the sections
// live in topic modules to keep each file readable.
import { BINDINGS_SECTION, BUILD_SECTION } from './build'
import { LOOPS_SECTION, MOCK_DELAY_SECTION, TRANSFORMS_SECTION } from './nodes'
import { CREDENTIALS_SECTION, ENVIRONMENTS_SECTION, PROJECTS_SECTION, SHARING_SECTION } from './project'
import { DATA_SECTION, SHORTCUTS_SECTION, TROUBLESHOOTING_SECTION } from './reference'
import { RUN_SECTION } from './run'
import { FIRST_LAUNCH_SECTION, INSTALL_SECTION, WINDOW_SECTION } from './start'
import type { DocSection } from './types'

export type { DocBlock, DocLink, DocSection, DocSubsection, NoteTone } from './types'

export const DOCS_PAGE = {
  title: 'Docs',
  heading: 'How to use Cascade',
  lead: 'From first launch to a board that seeds a whole environment: building chains, bindings, loops, runs, secrets and sharing, and where your data lives.',
  description:
    'The Cascade user guide: install, build and run a board, bindings, loops, transforms, environments, credentials, sharing, shortcuts and troubleshooting.',
  navLabel: 'On this page',
} as const

export const DOC_SECTIONS: readonly DocSection[] = [
  INSTALL_SECTION,
  FIRST_LAUNCH_SECTION,
  WINDOW_SECTION,
  BUILD_SECTION,
  BINDINGS_SECTION,
  LOOPS_SECTION,
  TRANSFORMS_SECTION,
  MOCK_DELAY_SECTION,
  RUN_SECTION,
  ENVIRONMENTS_SECTION,
  CREDENTIALS_SECTION,
  PROJECTS_SECTION,
  SHARING_SECTION,
  DATA_SECTION,
  SHORTCUTS_SECTION,
  TROUBLESHOOTING_SECTION,
]
