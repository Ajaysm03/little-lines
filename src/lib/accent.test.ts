import { describe, expect, it } from 'vitest'
import { accentStyle, bookAccent, contrast, darken, INK, luminance } from './accent'
import { sceneUrl } from '../content/scenes'

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
    expect(contrast('#ffffff', '#ffffff')).toBe(1)
  })

  it('darken lowers luminance', () => {
    expect(luminance(darken('#c8283a', 0.3))).toBeLessThan(luminance('#c8283a'))
  })
})

describe('bookAccent', () => {
  it('keeps a deep accent and puts white text on it', () => {
    const a = bookAccent({ accent: '#B7334B' })
    expect(a.acc).toBe('#b7334b')
    expect(a.onAcc).toBe('#ffffff')
    expect(contrast(a.onAcc, a.acc)).toBeGreaterThanOrEqual(4.5)
  })

  it('puts cocoa text on a light accent', () => {
    const a = bookAccent({ accent: '#f2c230' })
    expect(a.onAcc).toBe(INK)
    expect(contrast(a.onAcc, a.acc)).toBeGreaterThanOrEqual(4.5)
  })

  it('deepens a mid accent until white text reads', () => {
    const a = bookAccent({ accent: '#3d8be8' })
    expect(contrast(a.onAcc, a.acc)).toBeGreaterThanOrEqual(4.5)
  })

  it('always readable, whatever the cover gave us', () => {
    for (const hex of ['#c8283a', '#2f7d4f', '#f2b84b', '#7fa7d9', '#8559d9', '#e8a98a', '#9aa3b5', '#ff00ff', '#00ffff']) {
      const a = bookAccent({ accent: hex })
      expect(contrast(a.onAcc, a.acc)).toBeGreaterThanOrEqual(4.5)
      expect(luminance(a.accDk)).toBeLessThan(luminance(a.acc))
    }
  })

  it('falls back for missing or broken colors', () => {
    expect(bookAccent(null).acc).toBe('#b7334b')
    expect(bookAccent({ accent: 'red' }).acc).toBe('#b7334b')
  })

  it('accentStyle sets the three CSS variables', () => {
    const s = accentStyle({ accent: '#2f7d4e' }) as Record<string, string>
    expect(Object.keys(s).sort()).toEqual(['--acc', '--acc-dk', '--on-acc'])
  })
})

describe('sceneUrl', () => {
  it('uses winter until other seasons exist', () => {
    expect(sceneUrl('home', 'summer')).toBe('/scenes/winter/home.webp')
    expect(sceneUrl('reader')).toBe('/scenes/winter/reader.webp')
    expect(sceneUrl('library', 'winter', true)).toBe('/scenes/winter/library-1200.webp')
  })
})
