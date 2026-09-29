import { describe, expect, it } from 'vitest'
import { jsonTokens } from './jsonTokens'

describe('jsonTokens', () => {
  it('tells keys from string and number values', () => {
    expect(jsonTokens('  "formatVersion": 1,')).toEqual([
      { text: '  ', kind: 'plain' },
      { text: '"formatVersion"', kind: 'key' },
      { text: ': ', kind: 'plain' },
      { text: '1', kind: 'number' },
      { text: ',', kind: 'plain' },
    ])
    expect(jsonTokens('"kind": "board"').map((t) => t.kind)).toEqual(['key', 'plain', 'string'])
  })

  it('keeps digits inside strings and marks elisions', () => {
    expect(jsonTokens('{ "id": "n1", … }').map((t) => t.kind)).toEqual([
      'plain',
      'key',
      'plain',
      'string',
      'plain',
      'elided',
      'plain',
    ])
  })

  it('round-trips the text', () => {
    const line = '      "edges": [{ "id": "e1", "from": "n1", "to": "n2" }]'
    expect(
      jsonTokens(line)
        .map((t) => t.text)
        .join(''),
    ).toBe(line)
  })
})
