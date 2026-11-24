import { describe, expect, it } from 'vitest'
import { BUNDLED_BOOKS } from '../content/books'
import { stickerStates } from './achievements'
import { computeDeviceStats, computeProfileStats, dayKey, formatDuration, lastDays } from './analytics'
import type { Account, ActivityEvent, Artwork, Profile } from './types'

const book = BUNDLED_BOOKS[0]
const NOW = new Date(2026, 10, 24, 15, 0).getTime() // 24 Nov 2026, 3 pm local
const day = (offset: number, hour = 10) => new Date(2026, 10, 24 + offset, hour, 0).getTime()

function coloring(at: number, data: Record<string, unknown>, profileId = 'p1', accountId = 'a1'): ActivityEvent {
  return { accountId, profileId, type: 'coloring', bookId: book.id, pageId: '01-trimming-the-tree', at, data }
}
function open(at: number, pageId = '01-trimming-the-tree', profileId = 'p1', accountId = 'a1'): ActivityEvent {
  return { accountId, profileId, type: 'color_open', bookId: book.id, pageId, at }
}
function art(pageId: string, done: boolean, progress = done ? 1 : 0.4): Artwork {
  return {
    id: `p1:${book.id}:${pageId}`,
    profileId: 'p1',
    bookId: book.id,
    pageId,
    colorLayer: null,
    thumb: null,
    progress,
    completedAt: done ? NOW : null,
    updatedAt: NOW,
  }
}

describe('day helpers', () => {
  it('lists the last days oldest first, ending today', () => {
    const days = lastDays(7, NOW)
    expect(days).toHaveLength(7)
    expect(days[6].key).toBe(dayKey(NOW))
    expect(days[0].key).toBe('2026-11-18')
  })

  it('formats durations for people', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(20000)).toBe('Less than 1 min')
    expect(formatDuration(12 * 60000)).toBe('12 min')
    expect(formatDuration(65 * 60000)).toBe('1 h 5 min')
    expect(formatDuration(120 * 60000)).toBe('2 h')
  })
})

describe('computeProfileStats', () => {
  const events: ActivityEvent[] = [
    open(day(-3, 9)),
    coloring(day(-3), { ms: 5 * 60000, strokes: 20, fills: 2, colors: ['#c8283a', '#2f7d4f'], tools: ['crayon', 'fill'] }),
    open(day(-1, 9)),
    coloring(day(-1), { ms: 3 * 60000, strokes: 5, colors: ['#c8283a'], tools: ['glitter'] }),
    open(day(0, 9)),
    coloring(day(0), { ms: 2 * 60000, strokes: 3, colors: ['#c8283a', 'rainbow'], tools: ['fill-rainbow'] }),
    { accountId: 'a1', profileId: 'p1', type: 'page_turn', bookId: book.id, at: day(0) },
    coloring(day(-30), { ms: 60000, strokes: 1 }), // long ago: counts in totals, not the week
  ]
  const s = computeProfileStats(events, [art('01-trimming-the-tree', true), art('02-santas-workshop', false)], BUNDLED_BOOKS, NOW)

  it('totals time and puts it on the right days of the week', () => {
    expect(s.totalMs).toBe(11 * 60000)
    expect(s.weekMs).toBe(10 * 60000)
    expect(s.week.map((d) => d.ms / 60000)).toEqual([0, 0, 0, 5, 0, 3, 2])
  })

  it('counts the current streak and the best streak', () => {
    expect(s.streak).toBe(2) // yesterday and today
    expect(s.bestStreak).toBe(2)
  })

  it('ranks favorite colors and ignores the rainbow fill as a color', () => {
    expect(s.favoriteColors[0]).toEqual({ color: '#c8283a', count: 3 })
    expect(s.distinctColors).toBe(2)
    expect(s.tools.has('fill-rainbow')).toBe(true)
  })

  it('counts pages, sessions and page turns', () => {
    expect(s.pagesFinished).toBe(1)
    expect(s.pagesStarted).toBe(1)
    expect(s.booksFinished).toEqual([])
    expect(s.sessions).toBe(3)
    expect(s.avgSessionMs).toBeCloseTo((10 * 60000) / 3)
    expect(s.pageTurns).toBe(1)
    expect(s.lastActive).toBe(day(0))
  })

  it('keeps a streak alive until the end of today', () => {
    const t = computeProfileStats([coloring(day(-1), { ms: 1000, strokes: 1 })], [], BUNDLED_BOOKS, NOW)
    expect(t.streak).toBe(1)
    const gone = computeProfileStats([coloring(day(-2), { ms: 1000, strokes: 1 })], [], BUNDLED_BOOKS, NOW)
    expect(gone.streak).toBe(0)
    expect(gone.bestStreak).toBe(1)
  })

  it('finishes a book when every colorable page is finished', () => {
    const all = book.pages.filter((p) => p.kind === 'line-art').map((p) => art(p.id, true))
    expect(computeProfileStats([], all, BUNDLED_BOOKS, NOW).booksFinished).toEqual([book.id])
  })
})

describe('stickers', () => {
  it('awards stickers from stats and reports progress on locked ones', () => {
    const s = computeProfileStats(
      [coloring(day(0), { ms: 30 * 60000, strokes: 4, colors: ['#111111'], tools: ['glitter'] })],
      [art('01-trimming-the-tree', true)],
      BUNDLED_BOOKS,
      NOW,
    )
    const byId = Object.fromEntries(stickerStates(s).map((x) => [x.id, x]))
    expect(byId['first-scribble'].earned).toBe(true)
    expect(byId['first-page'].earned).toBe(true)
    expect(byId['sparkle'].earned).toBe(true)
    expect(byId['four-pages']).toMatchObject({ earned: false, progress: 0.25 })
    expect(byId['hour']).toMatchObject({ earned: false, progress: 0.5 })
    expect(byId['rainbow'].earned).toBe(false)
  })
})

describe('computeDeviceStats', () => {
  it('summarises every family on the device', () => {
    const accounts: Account[] = [
      { id: 'a1', email: 'a@x.test', name: 'A', parentPinHash: '', role: 'admin', createdAt: 0, lastLoginAt: NOW },
      { id: 'a2', email: 'b@x.test', name: 'B', parentPinHash: '', role: 'parent', createdAt: 0, lastLoginAt: NOW - 1000 },
    ]
    const profiles: Profile[] = [
      { id: 'p1', accountId: 'a1', name: 'Maya', avatar: 'fox', color: 'sky', pinHash: null, createdAt: 0, lastActiveAt: null },
      { id: 'p2', accountId: 'a1', name: 'Leo', avatar: 'bear', color: 'sky', pinHash: null, createdAt: 0, lastActiveAt: null },
      { id: 'p3', accountId: 'a2', name: 'Zoe', avatar: 'owl', color: 'sky', pinHash: null, createdAt: 0, lastActiveAt: null },
    ]
    const events: ActivityEvent[] = [
      open(day(-1, 9)),
      coloring(day(-1), { ms: 4 * 60000, strokes: 3 }),
      open(day(0, 9), '02-santas-workshop', 'p3', 'a2'),
      { ...coloring(day(0), { ms: 2 * 60000, strokes: 1 }, 'p3', 'a2'), pageId: '02-santas-workshop' },
      open(day(0, 11), '02-santas-workshop', 'p3', 'a2'),
      { ...coloring(day(-10), { ms: 60000, strokes: 1 }, 'p2'), at: day(-10) },
    ]
    const d = computeDeviceStats(accounts, profiles, events, [art('01-trimming-the-tree', true)], NOW)
    expect(d).toMatchObject({ families: 2, children: 3, activeChildren7d: 2, pagesFinished: 1 })
    expect(d.totalMs).toBe(7 * 60000)
    expect(d.dailyActive).toHaveLength(14)
    expect(d.dailyActive[13].count).toBe(1)
    expect(d.dailyActive[12].count).toBe(1)
    expect(d.popularPages[0]).toMatchObject({ pageId: '02-santas-workshop', opens: 2 })
    expect(d.familyRows.find((r) => r.id === 'a1')).toMatchObject({ children: 2, totalMs: 5 * 60000 })
  })
})
