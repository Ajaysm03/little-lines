import { colorablePages, type Book } from '../content/books'
import type { Account, ActivityEvent, Artwork, Profile } from './types'

/**
 * Turns the activity log and saved artwork into the numbers behind the child
 * dashboard, the parent view and the device-wide admin view. Pure functions:
 * everything is passed in, so they are easy to test.
 */

const DAY = 24 * 60 * 60 * 1000

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** The last `n` local days ending today, oldest first. */
export function lastDays(n: number, now: number): Array<{ key: string; date: Date }> {
  const today = new Date(now)
  today.setHours(12, 0, 0, 0) // midday avoids DST edge cases
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today.getTime() - (n - 1 - i) * DAY)
    return { key: dayKey(d.getTime()), date: d }
  })
}

interface ColoringData {
  ms?: number
  strokes?: number
  fills?: number
  erases?: number
  colors?: string[]
  tools?: string[]
}

function coloringData(e: ActivityEvent): ColoringData {
  return (e.data ?? {}) as ColoringData
}

/** A coloring save counts towards a day if the child actually did something. */
function isActiveColoring(e: ActivityEvent): boolean {
  if (e.type !== 'coloring') return false
  const d = coloringData(e)
  return (d.ms ?? 0) > 0 || (d.strokes ?? 0) + (d.fills ?? 0) + (d.erases ?? 0) > 0
}

export interface DayTotal {
  key: string
  date: Date
  ms: number
}

export interface ProfileStats {
  totalMs: number
  weekMs: number
  /** Coloring time for each of the last 7 days, oldest first. */
  week: DayTotal[]
  /** Days in a row with coloring, ending today (or yesterday, if today hasn't started yet). */
  streak: number
  bestStreak: number
  pagesFinished: number
  pagesStarted: number
  booksFinished: string[]
  strokes: number
  fills: number
  distinctColors: number
  favoriteColors: Array<{ color: string; count: number }>
  tools: Set<string>
  pageTurns: number
  sessions: number
  avgSessionMs: number
  lastActive: number | null
}

export function computeProfileStats(
  events: ActivityEvent[],
  artworks: Artwork[],
  books: Book[],
  now = Date.now(),
): ProfileStats {
  const sorted = [...events].sort((a, b) => a.at - b.at)
  const week = lastDays(7, now).map((d) => ({ ...d, ms: 0 }))
  const weekIndex = new Map(week.map((d, i) => [d.key, i]))
  const activeDays = new Set<string>()
  const colorCounts = new Map<string, number>()
  const tools = new Set<string>()
  let totalMs = 0
  let strokes = 0
  let fills = 0
  let pageTurns = 0
  let lastActive: number | null = null
  const sessionTotals: number[] = []
  let session = -1

  for (const e of sorted) {
    if (e.type === 'page_turn') pageTurns++
    if (e.type === 'color_open') {
      sessionTotals.push(0)
      session = sessionTotals.length - 1
    }
    if (e.type !== 'coloring') continue
    const d = coloringData(e)
    const ms = Math.max(0, d.ms ?? 0)
    totalMs += ms
    strokes += d.strokes ?? 0
    fills += d.fills ?? 0
    if (session >= 0) sessionTotals[session] += ms
    for (const c of d.colors ?? []) if (c !== 'rainbow') colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1)
    for (const t of d.tools ?? []) tools.add(t)
    if ((d.colors ?? []).includes('rainbow')) tools.add('fill-rainbow')
    if (isActiveColoring(e)) {
      const key = dayKey(e.at)
      activeDays.add(key)
      const i = weekIndex.get(key)
      if (i !== undefined) week[i].ms += ms
      lastActive = e.at
    }
  }

  const { streak, best } = streaks(activeDays, now)
  const finished = artworks.filter((a) => a.completedAt)
  const started = artworks.filter((a) => !a.completedAt && a.progress > 0)
  const finishedIds = new Set(finished.map((a) => `${a.bookId}:${a.pageId}`))
  const booksFinished = books
    .filter((b) => {
      const pages = colorablePages(b)
      return pages.length > 0 && pages.every((p) => finishedIds.has(`${b.id}:${p.id}`))
    })
    .map((b) => b.id)
  const realSessions = sessionTotals.filter((t) => t > 0)

  return {
    totalMs,
    weekMs: week.reduce((s, d) => s + d.ms, 0),
    week,
    streak,
    bestStreak: best,
    pagesFinished: finished.length,
    pagesStarted: started.length,
    booksFinished,
    strokes,
    fills,
    distinctColors: colorCounts.size,
    favoriteColors: [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([color, count]) => ({ color, count })),
    tools,
    pageTurns,
    sessions: realSessions.length,
    avgSessionMs: realSessions.length ? realSessions.reduce((s, t) => s + t, 0) / realSessions.length : 0,
    lastActive,
  }
}

function streaks(days: Set<string>, now: number): { streak: number; best: number } {
  if (days.size === 0) return { streak: 0, best: 0 }
  // Current streak: walk back from today; a streak still counts if the last colored day was yesterday.
  let streak = 0
  let cursor = now
  if (!days.has(dayKey(cursor))) cursor -= DAY
  while (days.has(dayKey(cursor))) {
    streak++
    cursor -= DAY
  }
  // Best streak: longest run of consecutive calendar days.
  const sorted = [...days].sort()
  let best = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(`${sorted[i - 1]}T12:00:00`).getTime()
    const cur = new Date(`${sorted[i]}T12:00:00`).getTime()
    run = Math.round((cur - prev) / DAY) === 1 ? run + 1 : 1
    best = Math.max(best, run)
  }
  return { streak, best: Math.max(best, streak) }
}

// ── Device-wide (admin) ────────────────────────────────────────────────────

export interface DeviceStats {
  families: number
  children: number
  activeChildren7d: number
  totalMs: number
  pagesFinished: number
  avgSessionMs: number
  /** Children who colored on each of the last 14 days. */
  dailyActive: Array<{ key: string; date: Date; count: number }>
  popularPages: Array<{ bookId: string; pageId: string; opens: number; ms: number }>
  familyRows: Array<{ id: string; name: string; email: string; role: string; children: number; lastLoginAt: number; totalMs: number }>
}

export function computeDeviceStats(
  accounts: Array<Pick<Account, 'id' | 'name' | 'email' | 'role' | 'lastLoginAt'>>,
  profiles: Array<Pick<Profile, 'id' | 'accountId'>>,
  events: ActivityEvent[],
  artworks: Artwork[] | number,
  now = Date.now(),
): DeviceStats {
  const days = lastDays(14, now).map((d) => ({ ...d, kids: new Set<string>() }))
  const dayIndex = new Map(days.map((d, i) => [d.key, i]))
  const weekAgo = now - 7 * DAY
  const active7 = new Set<string>()
  const pages = new Map<string, { bookId: string; pageId: string; opens: number; ms: number }>()
  const msByAccount = new Map<string, number>()
  const sessionMs = new Map<string, number[]>() // per profile, totals per open
  let totalMs = 0

  for (const e of [...events].sort((a, b) => a.at - b.at)) {
    const pid = e.profileId ?? ''
    if (e.type === 'color_open' && e.bookId && e.pageId) {
      const key = `${e.bookId}:${e.pageId}`
      const p = pages.get(key) ?? { bookId: e.bookId, pageId: e.pageId, opens: 0, ms: 0 }
      p.opens++
      pages.set(key, p)
      const list = sessionMs.get(pid) ?? []
      list.push(0)
      sessionMs.set(pid, list)
    }
    if (e.type !== 'coloring') continue
    const ms = Math.max(0, coloringData(e).ms ?? 0)
    totalMs += ms
    msByAccount.set(e.accountId, (msByAccount.get(e.accountId) ?? 0) + ms)
    if (e.bookId && e.pageId) {
      const p = pages.get(`${e.bookId}:${e.pageId}`)
      if (p) p.ms += ms
    }
    const list = sessionMs.get(pid)
    if (list?.length) list[list.length - 1] += ms
    if (!isActiveColoring(e) || !pid) continue
    if (e.at >= weekAgo) active7.add(pid)
    const i = dayIndex.get(dayKey(e.at))
    if (i !== undefined) days[i].kids.add(pid)
  }

  const allSessions = [...sessionMs.values()].flat().filter((t) => t > 0)
  const childrenByAccount = new Map<string, number>()
  for (const p of profiles) childrenByAccount.set(p.accountId, (childrenByAccount.get(p.accountId) ?? 0) + 1)

  return {
    families: accounts.length,
    children: profiles.length,
    activeChildren7d: active7.size,
    totalMs,
    pagesFinished: typeof artworks === 'number' ? artworks : artworks.filter((a) => a.completedAt).length,
    avgSessionMs: allSessions.length ? allSessions.reduce((s, t) => s + t, 0) / allSessions.length : 0,
    dailyActive: days.map((d) => ({ key: d.key, date: d.date, count: d.kids.size })),
    popularPages: [...pages.values()].sort((a, b) => b.opens - a.opens || b.ms - a.ms).slice(0, 6),
    familyRows: accounts
      .map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email,
        role: a.role,
        children: childrenByAccount.get(a.id) ?? 0,
        lastLoginAt: a.lastLoginAt,
        totalMs: msByAccount.get(a.id) ?? 0,
      }))
      .sort((a, b) => b.lastLoginAt - a.lastLoginAt),
  }
}

/** "0 min", "Less than 1 min", "12 min", "1 h 5 min". */
export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  if (ms > 0 && min === 0) return 'Less than 1 min'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
