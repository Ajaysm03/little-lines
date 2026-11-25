import { describe, expect, it } from 'vitest'
import { cleanMeta } from './catalog.js'

describe('cleanMeta season', () => {
  it('keeps a known season', () => {
    expect(cleanMeta({ title: 'Seaside', season: 'summer' }).season).toBe('summer')
  })

  it('defaults to winter for missing or unknown seasons', () => {
    expect(cleanMeta({ title: 'Snowy' }).season).toBe('winter')
    expect(cleanMeta({ title: 'Odd', season: 'monsoon' }).season).toBe('winter')
  })
})
