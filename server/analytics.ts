import { query } from './db.js'
import { effectivePlan, type Plan } from './plans.js'

/**
 * Growth and content numbers for the owner console. "Active" means the family
 * did something in the app that day (opened a book, turned pages, colored),
 * from the activity log. Days follow the owner's time zone (`tzOffsetMin`, as
 * from Date.getTimezoneOffset()), so "today" matches the owner's calendar.
 */
const DAY = 86_400_000
const MAX_RANGE = 400 * DAY

export class AnalyticsError extends Error {
  readonly status = 400
}

export async function analytics(params: { from?: unknown; to?: unknown; tzOffsetMin?: unknown }) {
  const now = Date.now()
  const to = Math.min(Number(params.to) || now, now)
  const from = Number(params.from) || to - 30 * DAY
  if (!(from < to) || to - from > MAX_RANGE) throw new AnalyticsError('Choose a range of up to about a year.')
  // Shift timestamps so that whole days line up with the owner's midnight.
  const tz = Math.max(-840, Math.min(840, Math.round(Number(params.tzOffsetMin) || 0)))
  const shift = -tz * 60_000
  const day = (col: string) => `floor((${col} + ${shift}) / ${DAY})::bigint`

  const [families, signups, active, minutes, finished, windows, books, booksFinished, pages] = await Promise.all([
    query(`select f.plan, f.plan_ends_at, f.created_at from app_family f where f.role <> 'owner'`),
    query(`select ${day('created_at')} as d, count(*)::int as n from app_family where role <> 'owner' and created_at >= $1 and created_at < $2 group by 1`, [from, to]),
    query(`select ${day('e.at')} as d, count(distinct e.user_id)::int as n from app_event e where e.at >= $1 and e.at < $2 group by 1`, [from, to]),
    query(
      `select ${day('e.at')} as d, coalesce(sum((e.data->>'ms')::bigint), 0)::bigint as ms from app_event e
       where e.type = 'coloring' and e.at >= $1 and e.at < $2 group by 1`,
      [from, to],
    ),
    query(`select ${day('completed_at')} as d, count(*)::int as n from app_artwork where not deleted and completed_at >= $1 and completed_at < $2 group by 1`, [from, to]),
    // Distinct active families in the last 1, 7 and 30 days, counted back from the end of the range.
    query(
      `select count(distinct user_id) filter (where at >= $1::bigint - ${DAY})::int as d1,
              count(distinct user_id) filter (where at >= $1::bigint - ${7 * DAY})::int as d7,
              count(distinct user_id)::int as d30
       from app_event where at >= $1::bigint - ${30 * DAY} and at < $1::bigint`,
      [to],
    ),
    query(
      `select e.book_id,
         count(*) filter (where e.type = 'book_open')::int as opens,
         count(distinct e.user_id)::int as families,
         count(distinct e.profile_id) filter (where e.type in ('color_open', 'coloring'))::int as children,
         coalesce(sum((e.data->>'ms')::bigint) filter (where e.type = 'coloring'), 0)::bigint as ms
       from app_event e where e.book_id is not null and e.at >= $1 and e.at < $2 group by e.book_id`,
      [from, to],
    ),
    query(
      `select book_id,
         count(*) filter (where progress > 0)::int as started,
         count(*) filter (where completed_at is not null)::int as finished
       from app_artwork where not deleted and updated_at >= $1 and updated_at < $2 group by book_id`,
      [from, to],
    ),
    query(
      `select e.book_id, e.page_id, count(*) filter (where e.type = 'color_open')::int as opens,
         coalesce(sum((e.data->>'ms')::bigint) filter (where e.type = 'coloring'), 0)::bigint as ms
       from app_event e where e.page_id is not null and e.book_id is not null and e.type in ('color_open', 'coloring') and e.at >= $1 and e.at < $2
       group by e.book_id, e.page_id order by 3 desc, 4 desc limit 12`,
      [from, to],
    ),
  ])

  const planMix: Record<Plan, number> = { free: 0, trial: 0, premium: 0 }
  for (const f of families.rows) {
    const p = (['free', 'trial', 'premium'].includes(f.plan as string) ? f.plan : 'free') as Plan
    planMix[effectivePlan(p, f.plan_ends_at == null ? null : Number(f.plan_ends_at), now)]++
  }

  // One entry per day in the range, oldest first, with zeros for quiet days.
  const firstDay = Math.floor((from + shift) / DAY)
  const lastDay = Math.floor((to - 1 + shift) / DAY)
  const byDay = (rows: Array<Record<string, unknown>>, key: string) => new Map(rows.map((r) => [Number(r.d), Number(r[key])]))
  const s = byDay(signups.rows, 'n')
  const a = byDay(active.rows, 'n')
  const m = byDay(minutes.rows, 'ms')
  const f = byDay(finished.rows, 'n')
  const days = []
  for (let d = firstDay; d <= lastDay; d++)
    days.push({ day: d * DAY - shift, signups: s.get(d) ?? 0, activeFamilies: a.get(d) ?? 0, coloringMs: m.get(d) ?? 0, pagesFinished: f.get(d) ?? 0 })

  const finishedByBook = new Map(booksFinished.rows.map((r) => [r.book_id as string, { started: Number(r.started), finished: Number(r.finished) }]))
  const bookIds = new Set([...books.rows.map((r) => r.book_id as string), ...finishedByBook.keys()])
  const bookRows = [...bookIds].map((id) => {
    const e = books.rows.find((r) => r.book_id === id)
    const w = finishedByBook.get(id) ?? { started: 0, finished: 0 }
    return {
      bookId: id,
      opens: Number(e?.opens ?? 0),
      families: Number(e?.families ?? 0),
      children: Number(e?.children ?? 0),
      coloringMs: Number(e?.ms ?? 0),
      pagesStarted: w.started,
      pagesFinished: w.finished,
    }
  })

  const w = windows.rows[0] ?? { d1: 0, d7: 0, d30: 0 }
  return {
    from,
    to,
    totals: {
      families: families.rows.length,
      newFamilies: signups.rows.reduce((t, r) => t + Number(r.n), 0),
      activeToday: Number(w.d1),
      activeWeek: Number(w.d7),
      activeMonth: Number(w.d30),
      pagesFinished: finished.rows.reduce((t, r) => t + Number(r.n), 0),
      coloringMs: minutes.rows.reduce((t, r) => t + Number(r.ms), 0),
    },
    planMix,
    days,
    books: bookRows.sort((x, y) => y.opens - x.opens || y.pagesStarted - x.pagesStarted),
    pages: pages.rows.map((r) => ({ bookId: r.book_id as string, pageId: r.page_id as string, opens: Number(r.opens), coloringMs: Number(r.ms) })),
  }
}
