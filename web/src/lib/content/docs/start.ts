// Getting started: install, the demo project, and a tour of the window.
import { ANCHORS, ROUTES } from '$lib/config/routes'
import type { DocSection } from './types'

export const INSTALL_SECTION: DocSection = {
  id: 'install',
  title: 'Install',
  blocks: [
    {
      kind: 'text',
      text: 'Cascade runs on macOS 12 or later (Apple silicon and Intel), 64-bit Windows 10 and 11, and 64-bit Linux with WebKitGTK 4.1. Every build is free under the MIT License.',
    },
    {
      kind: 'text',
      text: 'The builds are not code-signed yet, so macOS and Windows ask for confirmation the first time you open Cascade. The download page shows how to get past that on each platform, and how to check your file against its published checksum.',
    },
    {
      kind: 'links',
      items: [
        { label: 'Install notes', href: ROUTES.download, hash: ANCHORS.install },
        { label: 'Build from source', href: ROUTES.download, hash: ANCHORS.buildFromSource },
      ],
    },
  ],
}

export const FIRST_LAUNCH_SECTION: DocSection = {
  id: 'first-launch',
  title: 'First launch',
  blocks: [
    {
      kind: 'text',
      text: 'The first time it starts, Cascade creates a project called **Default** with a demo board of five requests: **Create User**, **Create Org**, **Invite Member**, **Create Project** and **Get Project**. Each one after the first reads an id from a response before it.',
    },
    {
      kind: 'text',
      text: 'The requests are real. Every node targets the **local** environment, `http://localhost:8080`, so with nothing listening there, **Run** fails at Create User with a connection error and skips the other four.',
    },
    { kind: 'text', text: 'To point the demo at your own API:' },
    {
      kind: 'steps',
      items: [
        'Open the **Envs** tab in the sidebar and choose **Edit** on **local**.',
        'Set **Base URL** to your API, such as `http://localhost:3000/api`, and save.',
        'Click each node to open it in the inspector, and change its path and fields to match your endpoints.',
        'Press **Run** in the top bar.',
      ],
    },
    {
      kind: 'note',
      tone: 'info',
      text: 'The eight operations under **Sources** in the sidebar describe a made-up demo API. Importing your own OpenAPI document is not built yet, so for now add requests with **Add custom request** and keep the ones you reuse in a collection.',
    },
  ],
}

export const WINDOW_SECTION: DocSection = {
  id: 'window',
  title: 'The window',
  blocks: [
    {
      kind: 'table',
      head: ['Area', 'What it holds'],
      rows: [
        [
          'Top bar',
          'The sidebar toggle and the project switcher on the left. **Run**, **Stop** and the board menu (⋮) on the right.',
        ],
        [
          'Sidebar',
          'Three tabs: **Operations**, with the request catalog and your collections, then **Envs** and **Credentials**.',
        ],
        [
          'Canvas',
          'Your board. The **Select** and **Scissors** tools sit at the top left, zoom, fit and lock at the bottom left, and a minimap at the bottom right.',
        ],
        ['Inspector', 'Opens on the right when you select a node, with everything that node sends and returns.'],
        ['Logs', 'Along the bottom: every call made, newest first. Drag its top edge to make it taller.'],
      ],
    },
    {
      kind: 'text',
      text: 'There is no save button. The board is saved as you edit it, and so are environments, credentials and collections.',
    },
  ],
}
