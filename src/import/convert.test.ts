import { describe, expect, it } from 'vitest'
import { hexToHsl } from '../coloring/colors'
import { colorfulness, COLOR_PAGE, extractPalette, themeFrom, toLineArt } from './convert'

function pixels(colors: Array<[number, number, number, number?]>, repeat = 1): Uint8ClampedArray {
  const out = new Uint8ClampedArray(colors.length * repeat * 4)
  for (let r = 0; r < repeat; r++)
    colors.forEach(([R, G, B, A = 255], i) => out.set([R, G, B, A], (r * colors.length + i) * 4))
  return out
}

describe('toLineArt', () => {
  it('turns black ink opaque, paper transparent, and drops faint noise', () => {
    const src = pixels([
      [0, 0, 0],
      [255, 255, 255],
      [250, 250, 250],
      [128, 128, 128],
      [0, 0, 0, 0], // transparent counts as paper
    ])
    const out = new Uint8ClampedArray(src.length)
    toLineArt(src, out)
    const alpha = [3, 7, 11, 15, 19].map((i) => out[i])
    expect(alpha[0]).toBe(255)
    expect(alpha[1]).toBe(0)
    expect(alpha[2]).toBe(0)
    expect(alpha[3]).toBeGreaterThan(100)
    expect(alpha[3]).toBeLessThan(140)
    expect(alpha[4]).toBe(0)
    // Ink is always pure black.
    expect([out[0], out[1], out[2], out[12], out[13], out[14]]).toEqual([0, 0, 0, 0, 0, 0])
  })
})

describe('colorfulness', () => {
  it('tells line art from painted pages', () => {
    const lineArt = pixels([[255, 255, 255], [0, 0, 0], [240, 240, 240], [30, 30, 30]], 200)
    const painted = pixels([[200, 40, 58], [30, 60, 140], [240, 200, 80], [255, 255, 255]], 200)
    expect(colorfulness(lineArt)).toBeLessThan(COLOR_PAGE)
    expect(colorfulness(painted)).toBeGreaterThan(COLOR_PAGE)
  })
})

describe('extractPalette', () => {
  it('finds the main colors of a cover, adds white and a dark, and sorts grays last', () => {
    const cover = pixels([[200, 40, 58], [30, 60, 140], [240, 190, 70], [40, 120, 70]], 400)
    const palette = extractPalette(cover, 6)
    const near = (target: [number, number, number]) =>
      palette.some((hex) => {
        const n = parseInt(hex.slice(1), 16)
        return Math.abs(((n >> 16) & 255) - target[0]) + Math.abs(((n >> 8) & 255) - target[1]) + Math.abs((n & 255) - target[2]) < 40
      })
    expect(near([200, 40, 58])).toBe(true)
    expect(near([30, 60, 140])).toBe(true)
    expect(palette).toContain('#ffffff')
    expect(palette.some((h) => hexToHsl(h)[2] < 22)).toBe(true)
    const firstGray = palette.findIndex((h) => hexToHsl(h)[1] < 15)
    expect(palette.slice(firstGray).every((h) => hexToHsl(h)[1] < 15)).toBe(true)
  })
})

describe('themeFrom', () => {
  it('picks a dark, a strong and a light color for the book theme', () => {
    const t = themeFrom(['#1d2f5c', '#c8283a', '#f2b84b', '#ffffff', '#3a3a44'])
    expect(t.deep).toBe('#1d2f5c')
    expect(t.accent).toBe('#c8283a')
    expect(t.glow).toBe('#f2b84b')
  })

  it('falls back to defaults for a gray palette', () => {
    expect(themeFrom(['#ffffff', '#888888'])).toEqual({ deep: '#1d2f5c', accent: '#c8283a', glow: '#f2b84b' })
  })
})
