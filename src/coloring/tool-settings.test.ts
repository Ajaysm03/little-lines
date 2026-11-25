import { describe, expect, it } from 'vitest'
import {
  SIZE_RANGE,
  SLIDE_SPAN,
  defaultSetting,
  hasStrength,
  settingsFor,
  sizeFraction,
  slideSize,
  slideStrength,
  stepSize,
  stepStrength,
} from './tool-settings'
import { TOOLS } from './tools'

describe('tool settings', () => {
  it('starts each tool at its old medium size and starting strength', () => {
    expect(defaultSetting('crayon')).toEqual({ size: TOOLS.crayon.sizes[1], strength: 100 })
    expect(defaultSetting('watercolor')).toEqual({ size: TOOLS.watercolor.sizes[1], strength: 55 })
  })

  it('keeps every default inside its range', () => {
    for (const [tool, [lo, hi]] of Object.entries(SIZE_RANGE)) {
      const d = defaultSetting(tool as keyof typeof SIZE_RANGE)
      expect(d.size).toBeGreaterThanOrEqual(lo)
      expect(d.size).toBeLessThanOrEqual(hi)
    }
  })

  it('covers the whole size range over one full slide', () => {
    const [lo, hi] = SIZE_RANGE.marker
    expect(slideSize('marker', lo, SLIDE_SPAN)).toBe(hi)
    expect(slideSize('marker', hi, -SLIDE_SPAN)).toBe(lo)
    expect(slideSize('marker', lo, SLIDE_SPAN / 2)).toBe(Math.round((lo + hi) / 2))
  })

  it('stops at the ends of the range', () => {
    expect(slideSize('pencil', 10, 10_000)).toBe(SIZE_RANGE.pencil[1])
    expect(slideSize('pencil', 10, -10_000)).toBe(SIZE_RANGE.pencil[0])
  })

  it('slides the other way in the left-handed layout', () => {
    expect(slideSize('crayon', 20, -60, true)).toBeGreaterThan(20)
    expect(slideStrength(50, 60, true)).toBeLessThan(50)
  })

  it('moves strength in steps of 5 between 15 and 100', () => {
    expect(slideStrength(50, 8)).toBe(55)
    expect(slideStrength(50, 1)).toBe(50)
    expect(slideStrength(50, 10_000)).toBe(100)
    expect(slideStrength(50, -10_000)).toBe(15)
    expect(slideStrength(50, 33) % 5).toBe(0)
  })

  it('steps with the keyboard', () => {
    expect(stepSize('eraser', 50, 1)).toBeGreaterThan(50)
    expect(stepSize('eraser', SIZE_RANGE.eraser[1], 1)).toBe(SIZE_RANGE.eraser[1])
    expect(stepStrength(100, 1)).toBe(100)
    expect(stepStrength(20, -1)).toBe(15)
  })

  it('remembers each tool separately and repairs bad saved values', () => {
    const s = settingsFor({ crayon: { size: 40, strength: 70 }, marker: { size: 9999, strength: 12 }, pencil: { size: Number.NaN } })
    expect(s.crayon).toEqual({ size: 40, strength: 70 })
    expect(s.marker).toEqual({ size: SIZE_RANGE.marker[1], strength: 15 })
    expect(s.pencil).toEqual(defaultSetting('pencil'))
    expect(s.watercolor).toEqual(defaultSetting('watercolor'))
  })

  it('maps size to a 0–1 position', () => {
    expect(sizeFraction('glitter', SIZE_RANGE.glitter[0])).toBe(0)
    expect(sizeFraction('glitter', SIZE_RANGE.glitter[1])).toBe(1)
  })

  it('only offers strength where the engine uses it', () => {
    expect(hasStrength('crayon')).toBe(true)
    expect(hasStrength('glitter')).toBe(false)
    expect(hasStrength('eraser')).toBe(false)
    expect(hasStrength('fill')).toBe(false)
  })
})
