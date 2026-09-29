// Running boards and reading the logs.
import type { DocSection } from './types'

export const RUN_SECTION: DocSection = {
  id: 'run',
  title: 'Run a board',
  blocks: [
    {
      kind: 'table',
      head: ['To run', 'Use'],
      rows: [
        ['The whole board', '**Run** in the top bar.'],
        [
          'A node and everything after it',
          'The play button on the node, shown when you hover or select it. Loops and notes have none.',
        ],
        ['A node and everything it depends on', 'Right-click it and choose **Run this node**.'],
        ['Everything connected to a node', 'Right-click it and choose **Run chain**.'],
      ],
    },
    {
      kind: 'list',
      items: [
        'Nodes run one at a time, each after everything it depends on. Independent branches do not run in parallel yet.',
        'A partial run reads the last responses of the nodes it leaves out, so you can rerun one step without repeating the ones before it.',
        '**Stop** cancels the request in flight. The interrupted node shows as stopped, and nodes the run had not reached stay idle.',
        'Only one run goes at a time.',
        'Requests time out after 30 seconds.',
      ],
    },
    {
      kind: 'table',
      head: ['Status', 'Meaning'],
      rows: [
        ['idle', 'Not run since the board opened, or not reached yet.'],
        ['running', 'In flight now.'],
        ['success', 'Finished. For a request, the response status was below 400.'],
        [
          'failed',
          'The request could not be sent, the response status was 400 or above, or a binding could not be read. The card says which.',
        ],
        [
          'skipped',
          'Something it depends on failed or was skipped, so it never ran. Branches that do not depend on the failure still run.',
        ],
      ],
    },
  ],
  subsections: [
    {
      id: 'logs',
      title: 'Logs',
      blocks: [
        {
          kind: 'list',
          items: [
            'Every call gets a row, newest first, with its time, node, request, status and duration. Rows from inside a loop carry the iteration, counting from #1.',
            'Click a row for the full request and response.',
            'Filter by status, or type to match a node key, URL or run id.',
            'Hover a row to light up its node on the canvas.',
            'Skipped nodes get no row.',
            'Logs live in memory only. **Clear logs**, switching project or quitting empties them.',
          ],
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Cascade keeps the first 256 KiB of each response. A longer body is marked truncated, and bindings cannot read into it.',
        },
      ],
    },
  ],
}
