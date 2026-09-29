// Building a board: nodes, connections, the inspector, and bindings.
import { BINDING_EXAMPLES, BINDING_SYNTAX, NODE_KINDS } from '../features'
import type { DocSection } from './types'

export const BUILD_SECTION: DocSection = {
  id: 'build',
  title: 'Build a chain',
  blocks: [
    {
      kind: 'text',
      text: 'A board is a graph. Nodes are steps, and a connection from one node to another means the second depends on the first: it runs later, and can read what the first returned.',
    },
    {
      kind: 'table',
      head: ['Node', 'What it does'],
      rows: NODE_KINDS.map((kind) => [kind.name, kind.body]),
    },
  ],
  subsections: [
    {
      id: 'add-nodes',
      title: 'Add nodes',
      blocks: [
        {
          kind: 'list',
          items: [
            'Click a request under **Sources** or **Collections** in the sidebar to add it to the board.',
            'Right-click the empty canvas for **Add node…**, which searches the catalog, **Add custom request**, **Add transform**, **Add mock**, **Add delay**, **Add for loop** and **Add note**. The node lands where you clicked.',
            'Right-click a connection and pick one of its **Insert** entries to put a new node in the middle of it.',
            'Right-click a node to **Copy**, **Duplicate**, **Rename** or **Delete** it.',
          ],
        },
      ],
    },
    {
      id: 'connect',
      title: 'Connect nodes',
      blocks: [
        {
          kind: 'list',
          items: [
            'Drag from the handle on a node’s right edge to the handle on another node’s left edge.',
            'A label on the connection lists the named outputs its source hands on.',
            'Notes have no handles. They hold comments and never run.',
            'To remove a connection, right-click it and choose **Cut connection**, or select it and press Backspace. The **Scissors** tool (X) cuts every connection you click or drag across.',
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'The canvas does not stop you drawing a cycle, where a node ends up depending on itself. A board with one stops saving, with a **Board save failed** message, and cannot run until you cut one of the connections that close the circle.',
        },
      ],
    },
    {
      id: 'inspector',
      title: 'Edit a request',
      blocks: [
        { kind: 'text', text: 'Select an HTTP node to open it in the inspector. From top to bottom:' },
        {
          kind: 'table',
          head: ['Section', 'What you set'],
          rows: [
            [
              'Name and Key',
              'The name shows on the card. The key is how other nodes refer to this one, as in `{{createUser.body.id}}`: letters, digits and underscores, not starting with a digit. `res`, `i` and `item` are reserved.',
            ],
            [
              'Request',
              'The method and path. Placeholders such as `{id}` in the path become path parameters. The globe button sets an origin override, to call a different host than the environment’s.',
            ],
            [
              'Environment, Credential',
              'Where the request goes and which credential signs it. New nodes start on the project’s default environment.',
            ],
            [
              'Params, Headers, Body',
              'Rows of names and values. A value is literal text, a binding, or text with `{{…}}` in it. Body field names with dots nest, so `user.name` builds `{"user": {"name": …}}`. Switch the body to **raw** to send any text, templates included. GET and HEAD requests have no body.',
            ],
            [
              'Outputs',
              'Named exports: short names for values in the response, such as `userId` for `body.data.id`, for nodes downstream to use.',
            ],
            [
              'Response schema',
              'The shape of the response, inferred from the last run. **Use last response as schema** pins it, so it is saved with the board.',
            ],
          ],
        },
        {
          kind: 'note',
          tone: 'warning',
          text: 'A literal in a body field is always sent as a string: typing `100` sends `"100"`. To send a number, boolean or null, bind the field to a value that already has that type, or switch the body to **raw** and write the JSON yourself.',
        },
      ],
    },
  ],
}

export const BINDINGS_SECTION: DocSection = {
  id: 'bindings',
  title: 'Bindings',
  blocks: [
    {
      kind: 'text',
      text: 'A binding reads a value from a node upstream of the one you are editing. Use one in any param, header or body field, or inside a raw body.',
    },
    {
      kind: 'table',
      head: [BINDING_SYNTAX.syntaxLabel, BINDING_SYNTAX.meaningLabel],
      rows: BINDING_EXAMPLES.map((example) => [`\`${example.syntax}\``, example.meaning]),
    },
    {
      kind: 'text',
      text: `${BINDING_SYNTAX.lead} In \`member+{{i}}@example.com\`, the loop index becomes part of the email.`,
    },
  ],
  subsections: [
    {
      id: 'binding-picker',
      title: 'Pick instead of typing',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Connect the node you want to read from, directly or further upstream.',
            'Run it once, so Cascade can infer the shape of its response.',
            'Click the link button beside a field, **Insert reference…**, and pick a status, header or body field of any upstream node, or one of its named exports.',
          ],
        },
        {
          kind: 'text',
          text: 'The picker writes `{{key.path}}` at the cursor. Before an upstream node has run, type a path such as `body.data.id` into the box at the bottom of the picker instead.',
        },
      ],
    },
    {
      id: 'readable-nodes',
      title: 'What a node can read',
      blocks: [
        {
          kind: 'list',
          items: [
            'Any node upstream of it: its direct sources, their sources, and so on back.',
            '`res`, the one node directly upstream. With two or more direct sources, name the node you mean instead.',
            'Inside a For loop, the nodes before it in the loop and the loop’s own upstream nodes, plus `{{i}}` and, in each mode, `{{item}}`.',
          ],
        },
        {
          kind: 'text',
          text: 'The inspector flags a reference to any other node, and a node holding one fails without sending its request.',
        },
      ],
    },
    {
      id: 'named-exports',
      title: 'Named exports',
      blocks: [
        {
          kind: 'text',
          text: 'An export gives a value in a node’s response a short name. Add one under **Outputs**, say `userId` for `body.data.id`, and every node downstream can write `{{createUser.userId}}`. When the response changes shape, you fix one path on the node that returns it.',
        },
      ],
    },
  ],
}
