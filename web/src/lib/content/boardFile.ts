// Shared by the home page's sharing card and the features page.

/**
 * An excerpt of a `.cascade.json` export, following docs/format.md; the
 * ellipses stand for each node's request data.
 */
export const BOARD_FILE = {
  name: 'signup.cascade.json',
  lines: [
    '{',
    '  "cascade": {',
    '    "kind": "board",',
    '    "formatVersion": 1,',
    '    "board": {',
    '      "name": "Signup chain",',
    '      "nodes": [',
    '        { "id": "n1", "type": "http", "name": "Create User", … },',
    '        { "id": "n2", "type": "http", "name": "Create Org", … }',
    '      ],',
    '      "edges": [{ "id": "e1", "from": "n1", "to": "n2" }]',
    '    },',
    '    "requires": {',
    '      "environments": ["staging"],',
    '      "credentials": [{ "name": "staging-admin", "kind": "bearer" }]',
    '    }',
    '  }',
    '}',
  ],
} as const
