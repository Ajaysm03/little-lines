import { describe, expect, it } from 'vitest'
import { artworkId, FINISHED_AT, getArtwork, saveArtwork, UNFINISHED_BELOW } from './artworks'

const base = { profileId: 'p1', bookId: 'cozy-christmas', pageId: '01-trimming-the-tree' }
const blob = () => new Blob(['x'], { type: 'image/png' })

describe('saveArtwork', () => {
  it('stores the coloring under one id per child and page', async () => {
    await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: 0.2 })
    const art = await getArtwork('p1', base.bookId, base.pageId)
    expect(art?.id).toBe(artworkId('p1', base.bookId, base.pageId))
    expect(art?.progress).toBeCloseTo(0.2)
    expect(art?.completedAt).toBeNull()
    expect(await getArtwork('p2', base.bookId, base.pageId)).toBeUndefined()
  })

  it('finishes a page at the threshold, keeps it through small erasing, and un-finishes when mostly erased', async () => {
    const done = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: FINISHED_AT })
    expect(done.completedAt).not.toBeNull()

    const touchUp = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: UNFINISHED_BELOW + 0.05 })
    expect(touchUp.completedAt).toBe(done.completedAt)

    const erased = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: UNFINISHED_BELOW - 0.1 })
    expect(erased.completedAt).toBeNull()
  })

  it('keeps a page the child finished, even below the threshold, until it is cleared', async () => {
    const mine = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: 0.3, finish: true })
    expect(mine.completedAt).not.toBeNull()
    expect(mine.finishedByChild).toBe(true)
    const later = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: 0.25 })
    expect(later.completedAt).toBe(mine.completedAt)
    const cleared = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: 0 })
    expect(cleared.completedAt).toBeNull()
    expect(cleared.finishedByChild).toBe(false)
  })

  it('clamps progress into 0–1', async () => {
    const art = await saveArtwork({ ...base, colorLayer: blob(), thumb: blob(), progress: 1.7 })
    expect(art.progress).toBe(1)
  })
})
