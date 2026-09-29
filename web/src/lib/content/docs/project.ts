// Project-level setup: environments, credentials, projects, collections and sharing.
import { LINKS } from '$lib/config/site'
import { KEYCHAIN_SERVICE } from '../app'
import type { DocSection } from './types'

export const ENVIRONMENTS_SECTION: DocSection = {
  id: 'environments',
  title: 'Environments',
  blocks: [
    {
      kind: 'text',
      text: 'An environment is a named base URL, such as `staging` at `https://staging.api.example.com`. Each node’s path is joined onto it, so a prefix every path shares, like `/v1`, belongs in the base URL.',
    },
    {
      kind: 'steps',
      items: [
        'Open the **Envs** tab and choose **Add environment**.',
        'Give it a name and a base URL, then **Save**.',
        'Choose **Set default** on the environment new nodes should use.',
      ],
    },
    {
      kind: 'list',
      items: [
        'The first environment you add becomes the default. Deleting the default hands it to the next one.',
        'Pick another environment for a single node in its inspector, or set an origin override with the globe button to send it to another host altogether.',
        'Names cannot change after saving, because nodes refer to environments by name.',
        'Delete asks for a second click, and says how many nodes still use the environment.',
      ],
    },
  ],
}

export const CREDENTIALS_SECTION: DocSection = {
  id: 'credentials',
  title: 'Credentials',
  blocks: [
    {
      kind: 'table',
      head: ['Kind', 'Sends'],
      rows: [
        ['Bearer token', '`Authorization: Bearer <secret>`'],
        ['Basic auth', '`Authorization: Basic base64(<username>:<secret>)`'],
        ['Custom header', 'A header you name, such as `X-Api-Key: <secret>`'],
        ['Query parameter', 'A URL parameter you name, such as `?api_key=<secret>`'],
      ],
    },
    {
      kind: 'text',
      text: 'Custom header and query parameter credentials can wrap the secret in a value template, such as `Token {secret}`.',
    },
    {
      kind: 'steps',
      items: [
        'Open the **Credentials** tab and choose **Add credential**.',
        'Name it, pick a kind, fill in its fields and the secret value, then **Save**.',
        'Select it under **Credential** in a node’s inspector.',
      ],
    },
    {
      kind: 'list',
      items: [
        'The secret is write-only: once saved, Cascade never shows it again. **Rotate** on the credential’s card replaces it.',
        'Secrets are masked in logs, test results and error messages.',
        'A node whose credential has no secret stored fails until you set one, or pick None to send it without auth.',
      ],
    },
    {
      kind: 'note',
      tone: 'warning',
      text: 'A query parameter credential puts the secret in the URL, where the target server’s access logs can record it. Use a header kind when the API accepts one.',
    },
  ],
  subsections: [
    {
      id: 'secret-storage',
      title: 'Where secrets are kept',
      blocks: [
        {
          kind: 'text',
          text: `Secrets go to your system’s keychain: Keychain on macOS, Credential Manager on Windows, and the Secret Service, such as GNOME Keyring, on Linux. Each one is stored under the service \`${KEYCHAIN_SERVICE}\`, with the account \`<project id>/<credential name>\`.`,
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'Where no keychain is available, such as a Linux machine with no keyring running, Cascade falls back to an encrypted `secrets.enc` file in its data folder. Its key sits in the same folder, so this keeps secrets out of plain sight but does not protect them from anyone who can read that folder. The app still says “OS keychain” in this mode.',
        },
      ],
    },
  ],
}

export const PROJECTS_SECTION: DocSection = {
  id: 'projects',
  title: 'Projects and collections',
  blocks: [
    {
      kind: 'text',
      text: 'A project holds a board plus its own environments, credentials and collections. Keep one per system you seed.',
    },
    {
      kind: 'list',
      items: [
        'Switch, create, rename and delete projects from the project switcher in the top bar. Cascade reopens the one you used last.',
        'A new project starts empty: no environments, credentials or collections, and a blank board.',
        'Deleting a project removes its folder and its secrets. Deleting the last one leaves you a new, empty Default project.',
      ],
    },
    {
      kind: 'note',
      tone: 'warning',
      text: 'A project shows one board for now, with no way to add, rename or switch boards. **Import board…** adds a second board and opens it, but once the project is reopened only one of the two can be reached.',
    },
  ],
  subsections: [
    {
      id: 'collections',
      title: 'Collections',
      blocks: [
        {
          kind: 'text',
          text: 'Collections keep the requests you reuse, in folders up to three levels deep. Click a request in the sidebar to add it to the board.',
        },
        {
          kind: 'list',
          items: [
            'Right-click an HTTP node and choose **Save to collection…** to keep it. The collection stores literal values only; bindings and credentials stay on the board.',
            'A node added from a collection stays linked to its request. After you change the node, **Update collection request** in its menu writes the changes back.',
            'Right-click a collection or folder for **New request…**, **New folder**, **Rename** and **Delete**, and a request for **Edit request…** and **Duplicate** too.',
            'A request’s **Test** tab sends it once, outside any run, and can turn the response into a schema.',
          ],
        },
      ],
    },
  ],
}

export const SHARING_SECTION: DocSection = {
  id: 'sharing',
  title: 'Share boards',
  blocks: [
    {
      kind: 'text',
      text: 'Boards travel as `.cascade.json` files: versioned JSON with a stable key order, so they diff cleanly in git. They carry credential names and kinds, never secret values.',
    },
    {
      kind: 'table',
      head: ['To', 'Use'],
      rows: [
        ['Save the board as a file', '**Export board…** in the board menu, the ⋮ button at the top right.'],
        ['Open a board file', '**Import board…** in the same menu. It always adds a new board and opens it.'],
        ['Copy the whole board', '**Copy board as JSON** in the same menu.'],
        ['Copy some nodes', 'Select them and press Cmd+C (Ctrl+C), or right-click one and choose **Copy**.'],
        ['Paste nodes', 'Press Cmd+V (Ctrl+V), or right-click the canvas and choose **Paste**. It works across projects.'],
      ],
    },
    {
      kind: 'list',
      items: [
        'Exports leave out run state and captured responses.',
        'Pasted nodes get fresh keys, and the bindings between them follow along. A binding to a node you did not copy is dropped, and its field asks you to bind it again.',
        'When a board or paste needs environments or credentials this project lacks, **Map imported requirements** lets you create placeholders, use ones you have, or leave them unmapped. Placeholders get no base URL or secret until you fill them in.',
        `The [format specification](${LINKS.formatSpec}) documents every field, for tools that write or read boards.`,
      ],
    },
  ],
  subsections: [
    {
      id: 'captured-responses',
      title: 'Responses in board files',
      blocks: [
        {
          kind: 'text',
          text: 'To feed the binding picker, board files keep each node’s last response, and a login node’s response can hold a real access token. Turn off **Save response bodies in board files** in the board menu to leave them out of every board in the project. The inferred schemas are saved either way, so the picker keeps working.',
        },
      ],
    },
  ],
}
