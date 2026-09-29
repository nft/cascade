import { describe, expect, it } from 'vitest'
import { iconFontUrl } from './fonts'
import { ICONS } from './icons'

describe('iconFontUrl', () => {
  it('sorts and de-duplicates icon names, as Google requires', () => {
    const url = new URL(iconFontUrl(['menu', 'add', 'menu']))
    expect(url.searchParams.get('icon_names')).toBe('add,menu')
  })

  it('requests every registered icon by default', () => {
    const names = new URL(iconFontUrl()).searchParams.get('icon_names')?.split(',')
    expect(names).toHaveLength(new Set(ICONS).size)
  })

  it('registers only valid ligature names', () => {
    for (const name of ICONS) expect(name).toMatch(/^[a-z0-9_]+$/)
  })
})
