import { describe, expect, it } from 'vitest'
import { HARMONIES, hexToHsl, hslToHex, mix, suggestColors } from './colors'
import { isTapTool, TOOL_ORDER, TOOLS, toolWidth } from './tools'

describe('color conversions', () => {
  it('round-trips hex through HSL', () => {
    for (const hex of ['#c8283a', '#2f7d4f', '#f2b84b', '#7fa7d9', '#808080']) {
      const [h, s, l] = hexToHsl(hex)
      const back = hslToHex(h, s, l)
      const diff = parseInt(back.slice(1), 16) - parseInt(hex.slice(1), 16)
      expect(Math.abs(diff)).toBeLessThan(0x030303)
    }
  })

  it('mixes toward another color', () => {
    expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mix('#c8283a', '#c8283a', 0.7)).toBe('#c8283a')
  })
})

describe('suggestColors', () => {
  it('gives five valid colors for every rule', () => {
    for (const { id } of HARMONIES) {
      const list = suggestColors('#c8283a', id)
      expect(list).toHaveLength(5)
      for (const c of list) expect(c).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('puts opposites on the other side of the color wheel', () => {
    const [h] = hexToHsl('#c8283a')
    const [oh] = hexToHsl(suggestColors('#c8283a', 'opposites')[0])
    const gap = Math.abs(((oh - h + 720) % 360) - 180)
    expect(gap).toBeLessThan(6)
  })

  it('still suggests real colors for gray and black', () => {
    for (const c of suggestColors('#000000', 'neighbors')) {
      const [, s] = hexToHsl(c)
      expect(s).toBeGreaterThan(10)
    }
  })

  it('orders light-to-dark from light to dark', () => {
    const ls = suggestColors('#2e4f8c', 'light-dark').map((c) => hexToHsl(c)[2])
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThan(ls[i - 1])
  })
})

describe('tools', () => {
  it('has a spec, label and unique shortcut for every tool', () => {
    const keys = TOOL_ORDER.map((t) => TOOLS[t].shortcut)
    expect(new Set(keys).size).toBe(keys.length)
    expect(isTapTool('fill')).toBe(true)
    expect(isTapTool('picker')).toBe(true)
    expect(isTapTool('crayon')).toBe(false)
  })

  it('scales widths with the page', () => {
    expect(toolWidth(14, 1600)).toBe(14)
    expect(toolWidth(14, 800)).toBe(7)
  })
})

describe('colorName', () => {
  it('names colors in plain words', async () => {
    const { colorName } = await import('./colors')
    expect(colorName('#ffffff')).toBe('white')
    expect(colorName('#000000')).toBe('black')
    expect(colorName('#808080')).toBe('gray')
    expect(colorName('#e0475b')).toBe('red')
    expect(colorName('#3d8be8')).toBe('blue')
    expect(colorName('#9cc7ee')).toBe('light blue')
    expect(colorName('#2f7d4e')).toBe('green')
    expect(colorName('#f2c230')).toBe('yellow')
    expect(colorName('#7a4a2a')).toBe('brown')
    expect(colorName('nope')).toBe('color')
  })
})
