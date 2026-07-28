export const REPO_URL = 'https://github.com/nft/cascade'

/** Public origin of the published site, used for canonical and og:url tags. */
export const SITE_URL = 'https://nft.github.io/cascade/'

/** GitHub serves the newest release here, so the link never needs a version bump. */
export const RELEASES_URL = `${REPO_URL}/releases/latest`

export const SITE = {
  name: 'Cascade',
  tagline: 'Test data that actually hangs together',
  description:
    'Cascade is a desktop app for building realistic test data. Draw your API calls as a graph, let each step feed the next, and fill a whole environment with data that actually connects up.',
  repo: REPO_URL,
  /** Bare display form of `repo`, so the footer link text cannot drift from its href. */
  repoLabel: REPO_URL.replace(/^https?:\/\//, ''),
  url: SITE_URL,
  license: 'MIT',
} as const

export interface NavLink {
  href: string
  label: string
  /** Absolute links leave the site and open in a new tab. */
  external?: boolean
}

export const NAV_LINKS: NavLink[] = [
  { href: '#how', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: 'docs.html', label: 'Docs' },
  { href: '#download', label: 'Download' },
]

export const HERO = {
  eyebrow: 'Free desktop app for macOS and Windows',
  headline: 'Test data that actually hangs together.',
  lede: 'Filling a staging environment by hand is miserable, and seed scripts go stale the week you write them. Cascade lets you draw the calls once — a user, then their org, then their projects — and every run produces fresh data where everything points at something real.',
  primaryCta: { href: '#download', label: 'Download Cascade' },
  secondaryCta: { href: '#how', label: 'See how it works' },
} as const

export interface Download {
  platform: string
  detail: string
  href: string
}

/** Both entries point at the newest release; that page carries the per-platform files. */
export const DOWNLOADS: Download[] = [
  { platform: 'Download for macOS', detail: 'Apple silicon and Intel', href: RELEASES_URL },
  { platform: 'Download for Windows', detail: '64-bit installer', href: RELEASES_URL },
]

export const DOWNLOAD_SECTION = {
  label: 'Download',
  title: 'Get Cascade',
  lede: 'One download, no account, and no server to run. Your data and your keys stay on your own machine.',
  note: 'Cascade is an early preview and still under active development. Expect rough edges — and please report anything that breaks.',
} as const

export interface Feature {
  title: string
  body: string
  /** Sprite symbol id, minus the `icon-` prefix. See `partials/icons.fhtml`. */
  icon: string
}

export const FEATURES: Feature[] = [
  {
    title: 'Built from your own API',
    body: 'Point Cascade at your API description and every endpoint becomes a block you can drop on the canvas, fields already laid out. Nothing to hand-write, nothing to keep in sync.',
    icon: 'schema',
  },
  {
    title: 'Steps feed each other',
    body: "Draw a line from one call to the next and pick the value to carry across — the new user's id, a token, a whole nested object. It is filled in from the real response, every run.",
    icon: 'binding',
  },
  {
    title: 'Runs in the right order',
    body: 'Cascade works out what depends on what, and runs independent branches side by side. Nothing fires before the thing it needs has come back.',
    icon: 'dag',
  },
  {
    title: 'Three rows or three thousand',
    body: 'Tell a step to repeat, or to run once for every item an earlier step returned. The relationships hold however far you scale it up.',
    icon: 'fanout',
  },
  {
    title: 'See exactly what was sent',
    body: 'Every call is recorded with its full request and response, status and timing. When something fails, the request that broke it is one click away.',
    icon: 'logs',
  },
  {
    title: 'Keep your environments straight',
    body: "Save your local, staging and sandbox targets with their own keys, then choose per step which one to hit. Keys live in your operating system's keychain, never in your files.",
    icon: 'lock',
  },
  {
    title: 'Save it and share it',
    body: 'A setup is a single file you can keep beside your project or hand to a teammate. Your secrets are left out — the file only names which credential to use.',
    icon: 'commit',
  },
  {
    title: 'Stays on your machine',
    body: 'A real desktop app, not a hosted service. Requests go straight from your computer to your API, so private and local environments work like any other.',
    icon: 'desktop',
  },
]

export interface Step {
  title: string
  body: string
}

export const STEPS: Step[] = [
  {
    title: 'Add the calls you need',
    body: 'Pick the endpoints you want and drop them on the canvas — create a user, create an org, add a project.',
  },
  {
    title: 'Join them up',
    body: 'Drag a line between two steps to say this one needs that one first, then point a field at the value you want carried over.',
  },
  {
    title: 'Say how much you want',
    body: 'Leave a step as a single call, or ask for fifty. Repeat a fixed number of times, or once per item something upstream returned.',
  },
  {
    title: 'Press run',
    body: 'Watch it work through the graph, filling your environment as it goes. Every call is logged, so you can check anything that looks off.',
  },
]

export interface FooterColumn {
  heading: string
  links: NavLink[]
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    heading: 'Product',
    links: [
      { href: '#download', label: 'Download' },
      { href: '#features', label: 'Features' },
      { href: '#how', label: 'How it works' },
    ],
  },
  {
    heading: 'Help',
    links: [
      { href: 'docs.html', label: 'Documentation' },
      { href: `${REPO_URL}/issues`, label: 'Report a problem', external: true },
      { href: REPO_URL, label: 'Source on GitHub', external: true },
    ],
  },
]

/** A still or clip the docs should carry, described well enough to shoot. */
export interface Media {
  /** Chooses the placeholder's icon and label. */
  kind: 'image' | 'video'
  caption: string
  /** What the finished asset needs to show. */
  brief: string
}

export interface DocsSection {
  id: string
  heading: string
  paragraphs: string[]
  media?: Media
  bullets?: string[]
  callout?: string
}

export const DOCS_INTRO =
  'Everything here is written for someone using Cascade, not building it. Start with installing, then work through your first cascade — dip into the rest when you need it.'

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'install',
    heading: 'Installing',
    paragraphs: [
      'Download the file for your platform and open it. There is nothing else to set up — no account, no server, no command line.',
      'On macOS, drag Cascade to your Applications folder. The first time you open it, macOS may say it is from an unidentified developer: right-click the app, choose Open, then confirm. On Windows, run the installer; if SmartScreen appears, choose More info and then Run anyway.',
    ],
    media: {
      kind: 'image',
      caption: 'The macOS install window',
      brief:
        'Screenshot of the opened .dmg: the Cascade icon on the left, the Applications folder shortcut on the right, drag arrow between them.',
    },
    bullets: [
      'macOS 12 or newer, Apple silicon or Intel.',
      'Windows 10 or newer, 64-bit.',
      'Cascade needs network access to reach the API you point it at, and nothing else.',
    ],
  },
  {
    id: 'first-run',
    heading: 'Your first cascade',
    paragraphs: [
      'Cascade opens with an example project already loaded, so you can see the shape of things before pointing it at your own API. The canvas in the middle holds your calls, the panel on the left lists what you can add, and the panel on the right configures whichever step is selected.',
      'Select a step, look at its fields on the right, then press Run in the top bar. Steps light up as they go: blue while the call is in flight, green when the response comes back, red if it fails.',
    ],
    media: {
      kind: 'video',
      caption: 'Building and running a small graph',
      brief:
        'Screen recording, roughly 45 seconds, no narration. Add two steps from the sidebar, connect them, bind one field from the first response, press Run, let the steps turn green. End on the run log with both requests visible.',
    },
  },
  {
    id: 'connecting',
    heading: 'Carrying values between steps',
    paragraphs: [
      "A line between two steps means the second waits for the first. It also makes the first step's response available to it, which is the part that does the real work.",
      'To use a value, click the field you want to fill and choose it from the earlier response instead of typing something in. When the graph runs, that field is filled from whatever actually came back — so the org you create really does belong to the user you just created.',
      'Fields you leave unbound take a plain value you type, or a generator for things that must differ each time, like an email address.',
    ],
    media: {
      kind: 'image',
      caption: 'Choosing a value from an earlier step',
      brief:
        'Screenshot of the field picker open on a body field, showing the upstream response tree with an id highlighted, and the resulting binding on the field behind it.',
    },
  },
  {
    id: 'volume',
    heading: 'Making more data',
    paragraphs: [
      'Any step can run more than once. Set a count to repeat it a fixed number of times, or point it at a list from an earlier step to run once per item.',
      'Everything downstream follows along, so turning one user into fifty gives you fifty organisations and their projects too, each attached to its own user.',
    ],
    media: {
      kind: 'image',
      caption: 'A repeating step and what it produces',
      brief:
        'Screenshot of the canvas with a step showing a repeat badge, its downstream steps showing matching counts, and the record total in the run summary.',
    },
  },
  {
    id: 'environments',
    heading: 'Environments and keys',
    paragraphs: [
      'An environment is a name and a base address — local, staging, whatever you use. A credential is the key or token that goes with it. Set both up once, then pick them per step, so two copies of the same call can hit two different places.',
      "Keys are held in your operating system's keychain, not in your project files. Once saved, a key is never shown again, and it is blanked out everywhere it would otherwise appear, including the run log.",
    ],
    media: {
      kind: 'image',
      caption: 'The environments and credentials screen',
      brief:
        'Screenshot of the settings area with two environments listed and a credential row showing a masked value and its injection rule.',
    },
    callout:
      'Sharing a setup never shares your keys. The exported file records which credential a step uses by name; whoever opens it fills in their own.',
  },
  {
    id: 'logs',
    heading: 'When something goes wrong',
    paragraphs: [
      'Every call is written to the run log with the address it used, what it sent, what came back, and how long it took. A failed step is one click from the exact request that broke.',
      'The usual culprits are a missing required field, a key pointed at the wrong environment, or a value that never got carried over from an earlier step. The log tells you which, because it shows the request as it was actually sent.',
    ],
    media: {
      kind: 'image',
      caption: 'A failed step and its request',
      brief:
        'Screenshot of a red step on the canvas beside its opened log entry, showing the request body and a 422 response with the validation message visible.',
    },
  },
  {
    id: 'sharing',
    heading: 'Saving and sharing your work',
    paragraphs: [
      'Your work saves as you go. To hand a setup to someone else, export it — you get a single file that can live in your project repository next to the service it fills.',
      'Because the file is plain text and leaves keys out, it reviews like any other change, and a teammate who opens it gets your exact graph pointed at their own environment.',
    ],
    media: {
      kind: 'image',
      caption: 'Exporting a setup',
      brief:
        'Screenshot of the export dialog with a target file chosen, plus a small inset of the resulting file open in an editor showing a credential referenced by name only.',
    },
  },
]
