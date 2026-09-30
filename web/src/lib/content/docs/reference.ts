// Reference material: the data folder, shortcuts and common errors.
import { ANCHORS, ROUTES } from '$lib/config/routes'
import { LINKS } from '$lib/config/site'
import { PLATFORM_IDS, PLATFORMS } from '$lib/release/platforms'
import { DATA_DIRS, KEYCHAIN_SERVICE } from '../app'
import type { DocSection } from './types'

export const DATA_SECTION: DocSection = {
  id: 'data',
  title: 'Where your data lives',
  blocks: [
    {
      kind: 'table',
      head: ['Platform', 'Data folder'],
      rows: PLATFORM_IDS.map((id) => [PLATFORMS[id].name, `\`${DATA_DIRS[id]}\``]),
    },
    {
      kind: 'text',
      text: 'On Linux, `$XDG_CONFIG_HOME/cascade` takes over when that variable is set. Inside the folder:',
    },
    {
      kind: 'code',
      label: 'cascade/',
      lines: [
        'projects.json               the project list',
        'projects/<project id>/',
        '  project.json              name and defaults',
        '  environments.json',
        '  credentials.json          names and kinds, no secrets',
        '  boards/<id>.json',
        '  collections/<id>.json',
        '  sources/<id>.json         request catalogs',
      ],
    },
    {
      kind: 'list',
      items: [
        'Everything is plain JSON, and each file is replaced whole on save, so a crash cannot leave one half written.',
        'Run state, logs and panel sizes are not saved.',
      ],
    },
  ],
  subsections: [
    {
      id: 'reset',
      title: 'Start over',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Quit Cascade.',
            'Delete the data folder.',
            'Open Cascade again. It creates the Default project with the demo board.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: `Secrets stay in the keychain after that. Remove the entries under the service \`${KEYCHAIN_SERVICE}\` with Keychain Access on macOS, Credential Manager on Windows, or Seahorse on Linux.`,
        },
      ],
    },
  ],
}

export const SHORTCUTS_SECTION: DocSection = {
  id: 'shortcuts',
  title: 'Keyboard and mouse',
  blocks: [
    {
      kind: 'table',
      head: ['Keys', 'Action'],
      rows: [
        ['Cmd+C (Ctrl+C)', 'Copy the selected nodes'],
        ['Cmd+V (Ctrl+V)', 'Paste nodes in the middle of the canvas'],
        ['Backspace, Delete', 'Delete the selection'],
        ['X', 'Scissors: click or drag across connections to cut them'],
        ['V', 'Back to the select tool'],
        ['Escape', 'Close a menu or dialog, leave the scissors, or clear the selection'],
        ['Shift + drag', 'Select every node in a box'],
        ['Cmd + click (Ctrl + click)', 'Add a node to the selection'],
        ['Drag the canvas, or Space + drag', 'Pan'],
        ['Scroll, pinch or double-click', 'Zoom'],
        ['Arrow keys', 'Move the selected nodes; hold Shift for bigger steps'],
      ],
    },
    {
      kind: 'list',
      items: [
        'Single-key shortcuts do nothing while you type in a field.',
        'There is no undo yet, and no shortcut to run or stop.',
        'The lock button at the bottom left stops nodes being selected, moved or connected. Panning, zooming and menus still work.',
      ],
    },
  ],
}

export const TROUBLESHOOTING_SECTION: DocSection = {
  id: 'troubleshooting',
  title: 'Troubleshooting',
  blocks: [
    {
      kind: 'table',
      head: ['You see', 'What to do'],
      rows: [
        [
          '`connection refused`, or `actively refused it` on Windows',
          'Nothing is listening where the node sends. Check its environment’s base URL in the **Envs** tab, and that your API is up.',
        ],
        [
          '`422 Unprocessable Entity`, or any status from 400',
          'The API turned the request down. Open its log row to compare what was sent with what came back. Body fields sent as strings are a common cause.',
        ],
        ['`node has no target`', 'Pick an environment for the node, or give it an origin override.'],
        [
          '`has no stored secret value`',
          'Choose **Rotate** on the credential in the **Credentials** tab to enter its secret, or pick None on the node.',
        ],
        [
          '`res is ambiguous`',
          'The node has more than one direct source. Name the one you mean, as in `{{createOrg.body.id}}`.',
        ],
        [
          '`is not an upstream ancestor`',
          'The binding reads a node that does not run before this one. Connect them, or bind to a node upstream.',
        ],
        ['`lost its binding to`', 'The field was bound to a node that was not copied along with it. Bind it again.'],
        [
          '`graph contains a cycle`',
          'Some node depends on itself through a circle of connections. Cut one of them.',
        ],
        [
          '`iteration 2 failed`',
          'A node inside the loop failed. The message counts iterations from 0 and the logs from #1, so look for the rows marked #3.',
        ],
        ['`script exceeded the 1s time limit`', 'A transform script ran past a second. Look for a loop that never ends.'],
        ['`a run is already in progress`', 'Let the current run finish, or press **Stop**.'],
      ],
    },
    {
      kind: 'text',
      text: 'If Windows SmartScreen stops Cascade, the install notes show the way past. On Linux, an error about `libwebkit2gtk-4.1` means WebKitGTK 4.1 needs installing.',
    },
    { kind: 'links', items: [{ label: 'Install notes', href: ROUTES.download, hash: ANCHORS.install }] },
    {
      kind: 'text',
      text: `Stuck on something else? [Open an issue on GitHub](${LINKS.newIssue}) with the message you see and the steps that led to it.`,
    },
  ],
}
