import { describe, expect, it } from 'vitest'
import { coverBox, layoutFor } from './Scene'

describe('coverBox', () => {
  it('fills a 4:3 screen exactly', () => {
    const b = coverBox(1366, 1024.5)
    expect(b.left).toBeCloseTo(0, 0)
    expect(b.scale).toBeCloseTo(1, 2)
  })

  it('crops top and bottom on a wide screen and keeps the picture centered', () => {
    const b = coverBox(1600, 900)
    expect(b.width).toBe(1600)
    expect(b.top).toBeLessThan(0)
    expect(b.top).toBeCloseTo((900 - b.height) / 2, 5)
  })

  it('crops the sides on a narrow screen', () => {
    const b = coverBox(820, 1180)
    expect(b.height).toBe(1180)
    expect(b.left).toBeLessThan(0)
  })
})

describe('layoutFor', () => {
  it('uses the picture band only for upright phones', () => {
    expect(layoutFor(390, 844)).toBe('band')
    expect(layoutFor(844, 390)).toBe('scene')
    expect(layoutFor(820, 1180)).toBe('scene')
    expect(layoutFor(1366, 1024)).toBe('scene')
  })
})
