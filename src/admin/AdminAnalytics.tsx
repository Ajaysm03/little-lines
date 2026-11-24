import { useEffect, useMemo, useState } from 'react'
import { BarList, ColumnChart, type ColumnDatum } from '../components/charts'
import { Button, cn, Spinner } from '../components/ui'
import { api, type Analytics } from '../data/api'
import { formatDuration } from '../data/analytics'
import { PLAN_NAMES } from '../data/plans'
import { useTitle } from '../lib/useTitle'
import { useBooks } from '../state/library-store'
import { AdminHeader, Panel } from './AdminLayout'

const DAY = 86_400_000
const INK = '#2b2f6b'

const RANGES = [
  { id: '7d', label: 'Last 7 days', days: 7, bucket: 'day' },
  { id: '30d', label: 'Last 30 days', days: 30, bucket: 'day' },
  { id: '90d', label: 'Last 90 days', days: 91, bucket: 'week' },
  { id: '12m', label: 'Last 12 months', days: 365, bucket: 'month' },
] as const
type RangeId = (typeof RANGES)[number]['id']
type Bucket = (typeof RANGES)[number]['bucket']

interface Group {
  key: string
  label: string
  name: string
  days: number
  signups: number
  activeSum: number
  coloringMs: number
  pagesFinished: number
}

const short = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const long = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
const monthShort = new Intl.DateTimeFormat(undefined, { month: 'short' })
const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/** Days as they are (7 and 30 days), weeks (90 days) or calendar months (12 months). */
function group(days: Analytics['days'], bucket: Bucket): Group[] {
  const out: Group[] = []
  days.forEach((d, i) => {
    const date = new Date(d.day)
    let key: string
    let label: string
    let name: string
    if (bucket === 'day') {
      key = String(d.day)
      label = days.length <= 7 ? date.toLocaleDateString(undefined, { weekday: 'short' }) : i % 5 === 0 ? short.format(date) : ''
      name = long.format(date)
    } else if (bucket === 'week') {
      const start = days[Math.floor(i / 7) * 7].day
      key = String(start)
      label = Math.floor(i / 7) % 2 === 0 ? short.format(start) : ''
      name = `Week of ${short.format(start)}`
    } else {
      key = `${date.getFullYear()}-${date.getMonth()}`
      label = monthShort.format(date)
      name = monthLong.format(date)
    }
    let g = out.find((x) => x.key === key)
    if (!g) out.push((g = { key, label, name, days: 0, signups: 0, activeSum: 0, coloringMs: 0, pagesFinished: 0 }))
    g.days++
    g.signups += d.signups
    g.activeSum += d.activeFamilies
    g.coloringMs += d.coloringMs
    g.pagesFinished += d.pagesFinished
  })
  return out
}

export function AdminAnalytics() {
  useTitle('Analytics')
  const [range, setRange] = useState<RangeId>('30d')
  const [data, setData] = useState<Analytics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const r = RANGES.find((x) => x.id === range)!

  useEffect(() => {
    let live = true
    setError(null)
    // Whole days from local midnight; the 12-month view starts on the 1st so it shows exactly 12 months.
    const midnight = new Date()
    midnight.setHours(0, 0, 0, 0)
    const from =
      r.bucket === 'month'
        ? new Date(midnight.getFullYear(), midnight.getMonth() - 11, 1).getTime()
        : midnight.getTime() - (r.days - 1) * DAY
    api
      .adminAnalytics(from, Date.now())
      .then((d) => live && setData(d))
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : 'Couldn’t load analytics.'))
    return () => {
      live = false
    }
  }, [r.days, r.bucket, nonce])

  return (
    <>
      <AdminHeader
        title="Analytics"
        intro="How families find and use Little Lines. A family is active on a day when they open a book, turn pages or color."
        actions={
          <div role="group" aria-label="Date range" className="flex flex-wrap gap-2">
            {RANGES.map((x) => (
              <button
                key={x.id}
                type="button"
                aria-pressed={range === x.id}
                onClick={() => setRange(x.id)}
                className={cn(
                  'min-h-10 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors',
                  range === x.id ? 'bg-ink text-white' : 'bg-paper text-ink ring-1 ring-mist hover:ring-ink/40',
                )}
              >
                {x.label}
              </button>
            ))}
          </div>
        }
      />
      {error ? (
        <div className="mt-8 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t load analytics.</p>
          <p className="mt-1 text-graphite">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => setNonce((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <p className="mt-10 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Adding it all up…
        </p>
      ) : (
        <Body data={data} bucket={r.bucket} rangeLabel={r.label.toLowerCase()} />
      )}
    </>
  )
}

function Body({ data, bucket, rangeLabel }: { data: Analytics; bucket: Bucket; rangeLabel: string }) {
  const groups = useMemo(() => group(data.days, bucket), [data.days, bucket])
  const library = useBooks()
  const t = data.totals
  const per = bucket === 'day' ? 'each day' : bucket === 'week' ? 'each week' : 'each month'
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—')

  const columns = (value: (g: Group) => number, display: (g: Group) => string): ColumnDatum[] =>
    groups.map((g) => ({ key: g.key, label: g.label, value: value(g), display: display(g), name: g.name }))

  const today = bucket === 'day' ? groups[groups.length - 1]?.key : undefined
  const bookRows = useMemo(() => {
    const seen = new Map(data.books.map((b) => [b.bookId, b]))
    const rows = library.map((b) => ({ book: b, stats: seen.get(b.id) ?? null }))
    for (const s of data.books) if (!library.some((b) => b.id === s.bookId)) rows.push({ book: undefined as never, stats: s })
    return rows.sort((a, b) => (b.stats?.opens ?? 0) - (a.stats?.opens ?? 0) || (b.stats?.pagesStarted ?? 0) - (a.stats?.pagesStarted ?? 0))
  }, [data.books, library])

  return (
    <div className="mt-8 flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Families" value={String(t.families)} note={t.newFamilies ? `${t.newFamilies} new in the ${rangeLabel}` : `None new in the ${rangeLabel}`} />
        <Stat label="Active today" value={String(t.activeToday)} note="Last 24 hours" />
        <Stat label="Active this week" value={String(t.activeWeek)} note="Last 7 days" />
        <Stat label="Active this month" value={String(t.activeMonth)} note={`${pct(t.activeMonth, t.families)} of all families`} />
        <Stat label="Premium families" value={String(data.planMix.premium)} note={`${data.planMix.trial} more on a trial`} />
        <Stat label="Pages finished" value={String(t.pagesFinished)} note={`In the ${rangeLabel}`} />
        <Stat label="Time coloring" value={formatDuration(t.coloringMs)} note={`In the ${rangeLabel}`} />
        <Stat label="Pages started" value={String(data.books.reduce((n, b) => n + b.pagesStarted, 0))} note={`Colored at least a little, ${rangeLabel}`} />
      </dl>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="New families" aside={<span className="text-[0.875rem] text-graphite">Sign-ups {per}</span>}>
          <ColumnChart
            caption={`Families who signed up ${per}, ${rangeLabel}`}
            color={INK}
            highlight={today}
            data={columns(
              (g) => g.signups,
              (g) => `${g.signups} ${g.signups === 1 ? 'family' : 'families'}`,
            )}
          />
        </Panel>
        <Panel title="Active families" aside={<span className="text-[0.875rem] text-graphite">{bucket === 'day' ? 'Each day' : `Average a day, ${per}`}</span>}>
          <ColumnChart
            caption={bucket === 'day' ? `Families active each day, ${rangeLabel}` : `Average families active a day, ${per}, ${rangeLabel}`}
            color={INK}
            highlight={today}
            data={columns(
              (g) => g.activeSum / g.days,
              (g) => {
                const v = g.activeSum / g.days
                const text = bucket === 'day' ? String(v) : v.toFixed(1)
                return `${text} ${v === 1 ? 'family' : 'families'}${bucket === 'day' ? '' : ' a day'}`
              },
            )}
          />
        </Panel>
        <Panel title="Time coloring" aside={<span className="text-[0.875rem] text-graphite">Minutes {per}</span>}>
          <ColumnChart
            caption={`Minutes spent coloring ${per}, ${rangeLabel}`}
            color={INK}
            highlight={today}
            data={columns(
              (g) => Math.round(g.coloringMs / 60000),
              (g) => formatDuration(g.coloringMs),
            )}
          />
        </Panel>
        <Panel title="Plans today" aside={<span className="text-[0.875rem] text-graphite">{t.families === 1 ? '1 family' : `${t.families} families`}</span>}>
          <BarList
            caption="Families on each plan today"
            color={INK}
            rows={(['premium', 'trial', 'free'] as const).map((p) => ({
              key: p,
              label: PLAN_NAMES[p],
              value: data.planMix[p],
              display: `${data.planMix[p]} (${pct(data.planMix[p], t.families)})`,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Books" aside={<span className="text-[0.875rem] text-graphite">In the {rangeLabel}</span>}>
        <div className="-mx-5 overflow-x-auto sm:-mx-6">
          <table className="w-full min-w-[48rem] text-left text-[0.9375rem]">
            <thead>
              <tr className="border-b border-mist text-graphite">
                <th scope="col" className="px-5 py-2.5 font-semibold sm:px-6">Book</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Families</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Opens</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Pages started</th>
                <th scope="col" className="px-3 py-2.5 text-right font-semibold">Finished</th>
                <th scope="col" className="px-3 py-2.5 font-semibold">Completion</th>
                <th scope="col" className="px-5 py-2.5 text-right font-semibold sm:px-6">Coloring</th>
              </tr>
            </thead>
            <tbody>
              {bookRows.map(({ book, stats }) => {
                const s = stats ?? { opens: 0, families: 0, pagesStarted: 0, pagesFinished: 0, coloringMs: 0 }
                const rate = s.pagesStarted ? s.pagesFinished / s.pagesStarted : null
                return (
                  <tr key={book?.id ?? stats?.bookId} className="border-b border-frost last:border-0">
                    <td className="px-5 py-3 sm:px-6">
                      <span className="flex items-center gap-3">
                        {book ? <img src={book.coverThumb} alt="" className="w-8 rounded-[2px_4px_4px_2px] shadow-book" /> : <span className="w-8" />}
                        <span className="font-semibold text-ink-deep">{book?.title ?? 'A book no longer in the library'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right text-ink-deep tabular-nums">{s.families}</td>
                    <td className="px-3 py-3 text-right text-ink-deep tabular-nums">{s.opens}</td>
                    <td className="px-3 py-3 text-right text-ink-deep tabular-nums">{s.pagesStarted}</td>
                    <td className="px-3 py-3 text-right text-ink-deep tabular-nums">{s.pagesFinished}</td>
                    <td className="px-3 py-3">
                      {rate === null ? (
                        <span className="text-graphite">—</span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <span className="block h-2 w-20 overflow-hidden rounded-full bg-mist" aria-hidden>
                            <span className="block h-full rounded-full" style={{ width: `${Math.round(rate * 100)}%`, backgroundColor: INK }} />
                          </span>
                          <span className="text-ink-deep tabular-nums">{Math.round(rate * 100)}%</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap text-ink-deep tabular-nums sm:px-6">{formatDuration(s.coloringMs)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.875rem] text-graphite">Completion is finished pages ÷ pages started, for pages colored in this range.</p>
      </Panel>

      <Panel title="Most popular pages" aside={<span className="text-[0.875rem] text-graphite">Opened to color, {rangeLabel}</span>}>
        {data.pages.length ? (
          <BarList
            caption="Pages opened for coloring most often"
            color={INK}
            rows={data.pages.map((p) => {
              const book = library.find((b) => b.id === p.bookId)
              const page = book?.pages.find((x) => x.id === p.pageId)
              return {
                key: `${p.bookId}:${p.pageId}`,
                label: page ? `${page.title} (${book!.title})` : p.pageId,
                value: p.opens,
                display: `${p.opens} ${p.opens === 1 ? 'time' : 'times'}, ${formatDuration(p.coloringMs).toLowerCase()}`,
              }
            })}
          />
        ) : (
          <p className="text-graphite">No pages opened in this range.</p>
        )}
      </Panel>
    </div>
  )
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-2xl bg-paper px-4 py-3.5 ring-1 ring-mist">
      <dt className="text-[0.875rem] leading-snug text-graphite">{label}</dt>
      <dd className="mt-1 font-display text-[1.625rem] leading-none font-bold text-ink-deep tabular-nums">{value}</dd>
      <dd className="mt-1.5 text-[0.8125rem] leading-snug text-graphite">{note}</dd>
    </div>
  )
}
