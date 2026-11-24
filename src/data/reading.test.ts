import { describe, expect, it } from 'vitest'
import { BUNDLED_BOOKS } from '../content/books'
import { visiblePages } from '../lib/spread'
import { db } from './db'
import { getLastRead, logEvent } from './events'
import { bookProgress, progressLabel } from './progress'
import type { Artwork } from './types'

const book = BUNDLED_BOOKS[0]

function art(pageId: string, progress: number, done = false): Artwork {
  return {
    id: `p1:${book.id}:${pageId}`,
    profileId: 'p1',
    bookId: book.id,
    pageId,
    colorLayer: null,
    thumb: null,
    progress,
    completedAt: done ? Date.now() : null,
    updatedAt: Date.now(),
  }
}

describe('bookProgress', () => {
  it('is new with no artwork', () => {
    const p = bookProgress(book, [])
    expect(p).toMatchObject({ total: 4, started: 0, finished: 0, status: 'new', fraction: 0 })
    expect(progressLabel(p)).toBe('4 pages to color')
  })

  it('counts started and finished pages and averages the fraction', () => {
    const p = bookProgress(book, [art('01-trimming-the-tree', 1, true), art('02-santas-workshop', 0.4)])
    expect(p).toMatchObject({ started: 1, finished: 1, status: 'in-progress' })
    expect(p.fraction).toBeCloseTo(0.35)
    expect(progressLabel(p)).toBe('1 of 4 pages done')
  })

  it('is finished when every page is done and ignores other books', () => {
    const all = book.pages.filter((x) => x.kind === 'line-art').map((x) => art(x.id, 1, true))
    const other = { ...art('x', 1, true), bookId: 'another-book' }
    const p = bookProgress(book, [...all, other])
    expect(p.status).toBe('finished')
    expect(progressLabel(p)).toBe('Finished')
  })
})

describe('getLastRead', () => {
  it('returns the newest reading event for the profile only', async () => {
    await logEvent({ accountId: 'a', profileId: 'p1', type: 'book_open', bookId: book.id, data: { pageIndex: 0 } })
    await new Promise((r) => setTimeout(r, 5))
    await logEvent({ accountId: 'a', profileId: 'p1', type: 'page_turn', bookId: book.id, data: { pageIndex: 3 } })
    await new Promise((r) => setTimeout(r, 5))
    await logEvent({ accountId: 'a', profileId: 'p2', type: 'page_turn', bookId: book.id, data: { pageIndex: 5 } })
    expect(await getLastRead('p1')).toMatchObject({ bookId: book.id, pageIndex: 3 })
    expect(await getLastRead('nobody')).toBeNull()
    expect(await db.events.count()).toBe(3)
  })
})

describe('visiblePages', () => {
  it('shows covers alone and pairs interior pages in landscape', () => {
    expect(visiblePages({ index: 0, orientation: 'landscape' }, 6)).toEqual([0])
    expect(visiblePages({ index: 1, orientation: 'landscape' }, 6)).toEqual([1, 2])
    expect(visiblePages({ index: 2, orientation: 'landscape' }, 6)).toEqual([1, 2])
    expect(visiblePages({ index: 4, orientation: 'landscape' }, 6)).toEqual([3, 4])
    expect(visiblePages({ index: 5, orientation: 'landscape' }, 6)).toEqual([5])
  })

  it('shows one page in portrait and clamps out-of-range indexes', () => {
    expect(visiblePages({ index: 2, orientation: 'portrait' }, 6)).toEqual([2])
    expect(visiblePages({ index: 99, orientation: 'portrait' }, 6)).toEqual([5])
    expect(visiblePages({ index: 0, orientation: 'portrait' }, 0)).toEqual([])
  })
})
