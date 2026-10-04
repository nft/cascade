// Copy for the download page. File names come from RELEASE_FILES so the
// instructions always match what the release workflow uploads.
import { REPO_URL } from '$lib/config/site'
import { RELEASE_FILES, type PlatformId } from '$lib/release/platforms'

export const DOWNLOAD_PAGE = {
  title: 'Download Cascade',
  lead: 'Free and open source under the MIT License. Builds for macOS, Windows and Linux come straight from GitHub Releases.',
  description: 'Download Cascade for macOS, Windows or Linux, verify the checksums, or build it from source.',
} as const

export const RELEASE_STATUS = {
  none: 'No build has been published yet. Until the first release lands, Cascade builds from source in a few commands.',
  unknown:
    'GitHub could not be reached when this page was built, so the files are not listed here. Every build is on the releases page.',
} as const

export interface InstallGuide {
  platform: PlatformId
  /** Inline markdown, one step per entry. */
  steps: readonly string[]
}

/** Linux builds unpack into this folder; release.yml creates it. */
export const LINUX_FOLDER = 'cascade-linux-x64'

export const INSTALL = {
  title: 'Install',
  lead: 'The macOS build is signed and notarized by Apple, so it opens like any other app. The Windows build is not code-signed yet, so SmartScreen may ask before its first launch. Once installed, Cascade checks for a newer release at launch and updates itself from Settings › About.',
} as const

export const INSTALL_GUIDES: readonly InstallGuide[] = [
  {
    platform: 'macos',
    steps: [
      'Open the disk image and drag **Cascade** into Applications.',
      'The first time you open it, macOS confirms the notarization with Apple and asks whether to open an app downloaded from the internet. Choose **Open**.',
    ],
  },
  {
    platform: 'windows',
    steps: [
      'Run the installer. It adds the WebView2 runtime if Windows does not have it yet.',
      'SmartScreen may call the app unrecognized, since it is not signed. Choose **More info**, then **Run anyway**.',
      'The portable zip skips the installer: extract it and run `Cascade.exe`. It needs WebView2, which Windows 11 includes.',
    ],
  },
  {
    platform: 'linux',
    steps: [
      'Install WebKitGTK 4.1: `sudo apt install libwebkit2gtk-4.1-0` on Debian and Ubuntu, `sudo dnf install webkit2gtk4.1` on Fedora.',
      `Unpack the tarball and start the app: \`tar -xzf ${RELEASE_FILES.linuxTar}\`, then \`./${LINUX_FOLDER}/Cascade\`.`,
    ],
  },
]

export interface CommandSet {
  label: string
  lines: readonly string[]
}

export const CHECKSUMS = {
  title: 'Verify your download',
  lead: `Every release carries a \`${RELEASE_FILES.checksums}\` file listing the SHA-256 of each build, and GitHub shows the same digests beside the files. Run the check in the folder holding both.`,
} as const

export const CHECKSUM_COMMANDS: readonly CommandSet[] = [
  { label: 'macOS', lines: [`grep ${RELEASE_FILES.macosDmg} ${RELEASE_FILES.checksums} | shasum -a 256 -c`] },
  { label: 'Linux', lines: [`grep ${RELEASE_FILES.linuxTar} ${RELEASE_FILES.checksums} | sha256sum -c`] },
  {
    label: 'Windows PowerShell',
    lines: [
      `(Get-FileHash .\\${RELEASE_FILES.windowsSetup}).Hash`,
      `# matches the ${RELEASE_FILES.windowsSetup} line in ${RELEASE_FILES.checksums}`,
    ],
  },
]

export const BUILD_FROM_SOURCE = {
  title: 'Build from source',
  lead: 'You need Go 1.25 or later, Bun, and the Wails v2 command-line tool at the version the project pins, plus a native webview toolchain.',
  toolchains: [
    '**macOS:** the Xcode Command Line Tools, from `xcode-select --install`.',
    '**Windows:** the WebView2 runtime, which Windows 11 includes. NSIS too, if you want the installer.',
    '**Linux:** gcc, pkg-config and the GTK 3 and WebKitGTK 4.1 development packages, such as `libgtk-3-dev` and `libwebkit2gtk-4.1-dev`.',
  ],
  commands: [
    `git clone ${REPO_URL}.git`,
    'cd cascade',
    "go install github.com/wailsapp/wails/v2/cmd/wails@$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v2)",
    'wails doctor',
    'wails build',
    '# The app lands in build/bin. On Linux with WebKitGTK 4.1, build with: wails build -tags webkit2_41',
  ],
} as const

export const DOWNLOAD_HELP = {
  text: 'Stuck on install, or found a bug?',
  link: 'Open an issue on GitHub',
} as const
