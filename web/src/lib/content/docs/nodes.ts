// The node kinds beyond plain requests: loops, transforms, mocks and delays.
import type { DocSection } from './types'

/** Every helper on `_` in transform scripts (core/transform/helpers.js). */
const SCRIPT_HELPERS = [
  'get',
  'pick',
  'omit',
  'keys',
  'values',
  'uniq',
  'uniqBy',
  'groupBy',
  'keyBy',
  'countBy',
  'chunk',
  'flatten',
  'compact',
  'first',
  'last',
  'range',
  'sum',
  'sumBy',
  'min',
  'max',
  'sortBy',
  'mapValues',
] as const

const helperList = SCRIPT_HELPERS.map((name) => `\`${name}\``).join(', ')

export const LOOPS_SECTION: DocSection = {
  id: 'loops',
  title: 'For loops',
  blocks: [
    {
      kind: 'text',
      text: 'A For loop is a container. The nodes inside it run as a group, once per iteration, one iteration after another.',
    },
    {
      kind: 'steps',
      items: [
        'Right-click the canvas and choose **Add for loop**.',
        'Drag nodes onto it. A node joins the loop when you drop its center inside, and leaves when you drag it out.',
        'Connect upstream nodes to the loop’s left handle, and its right handle to whatever comes after it.',
        'Select the loop and pick a mode in the inspector.',
      ],
    },
    {
      kind: 'table',
      head: ['Mode', 'Runs its nodes', 'Inside the loop'],
      rows: [
        ['count', 'A set number of times, from 1 to 10,000.', '`{{i}}` is the iteration, counting from 0.'],
        [
          'each',
          'Once per element of an array an upstream node returned, up to 10,000 elements.',
          '`{{item}}` is the element and `{{i}}` its index.',
        ],
      ],
    },
    {
      kind: 'list',
      items: [
        'Only HTTP, transform, mock and delay nodes can go inside a loop, and loops do not nest.',
        'Connections cannot cross the loop’s border. Connect outside nodes to the loop itself; the nodes inside connect only to each other.',
        'If any node fails during an iteration, the loop stops after that iteration and fails, and the nodes after the loop are skipped.',
        'Running any node inside a loop runs the whole loop.',
      ],
    },
  ],
  subsections: [
    {
      id: 'loop-results',
      title: 'Reading a loop’s results',
      blocks: [
        {
          kind: 'text',
          text: 'Downstream, a loop returns one array per node inside it, under that node’s key, with one response body per iteration. For a loop keyed `seedProjects` around a **Create Project** node, `{{seedProjects.createProject[*].id}}` is the id of every project it created.',
        },
        {
          kind: 'note',
          tone: 'info',
          text: 'Deleting a loop deletes the nodes inside it too, after asking. Drag them out first to keep them.',
        },
      ],
    },
  ],
}

export const TRANSFORMS_SECTION: DocSection = {
  id: 'transforms',
  title: 'Transforms',
  blocks: [
    {
      kind: 'text',
      text: 'A transform reshapes data between calls, for when one API’s response is not the next one’s request. What it returns is what nodes downstream read.',
    },
  ],
  subsections: [
    {
      id: 'pick-mode',
      title: 'Pick mode',
      blocks: [
        {
          kind: 'text',
          text: 'Each row writes one key of the result from an expression, such as `emails` from `res.body.members[*].email`, or `ownerId` from `{{createUser.body.id}}`. No code involved.',
        },
      ],
    },
    {
      id: 'script-mode',
      title: 'Script mode',
      blocks: [
        {
          kind: 'text',
          text: 'Write JavaScript that ends in `return`. The value it returns must be JSON, and becomes the node’s output.',
        },
        {
          kind: 'code',
          label: 'transform script',
          lines: [
            '// Build an invite for the org the previous node created.',
            'const { id } = res.body',
            'return { orgId: id, email: `admin+${i}@example.com`, role: "admin" }',
          ],
        },
        {
          kind: 'table',
          head: ['Name', 'Holds'],
          rows: [
            ['`res`', 'The direct upstream node’s response, as `{ status, headers, body }`, when there is exactly one.'],
            ['`nodes.<key>`', 'The response of any node upstream, in the same shape.'],
            ['`i`', 'The loop iteration, or 0 outside a loop.'],
            ['`item`', 'The current element, inside an each-mode loop.'],
            ['`_`', `Helpers: ${helperList}.`],
          ],
        },
        {
          kind: 'list',
          items: [
            'Scripts run in a sandbox inside the app, with no network, file system, timers or `require`.',
            'A script gets one second to run and can return up to 1 MiB of JSON.',
            '**Test against last responses** runs the transform on its upstream nodes’ last captured responses, with `i` as 0, and shows the result without changing the board.',
          ],
        },
      ],
    },
  ],
}

export const MOCK_DELAY_SECTION: DocSection = {
  id: 'mock-delay',
  title: 'Mocks and delays',
  blocks: [
    {
      kind: 'text',
      text: 'A **mock** returns JSON you write, with a status code from 100 to 599, standing in for an endpoint that does not exist yet. It is returned exactly as written: `{{…}}` inside it is not filled in, so reach for a transform when you need upstream data.',
    },
    {
      kind: 'text',
      text: 'A **delay** waits between 1 ms and 5 minutes, then passes on its upstream node’s output unchanged. Nodes run one at a time, so everything after the delay waits too, even on another branch. **Stop** cuts the wait short.',
    },
  ],
}
