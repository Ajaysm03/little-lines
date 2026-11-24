import { Clock, Flame, Star } from 'lucide-react'
import type { ReactNode } from 'react'
import { dayKey, formatDuration, type ProfileStats } from '../data/analytics'
import { ColumnChart } from './charts'
import { cn } from './ui'

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/** Minutes colored on each of the last seven days, today stressed. */
export function WeekChart({ stats, color }: { stats: ProfileStats; color: string }) {
  const today = dayKey(Date.now())
  return (
    <ColumnChart
      caption="Minutes colored on each of the last 7 days"
      color={color}
      highlight={today}
      data={stats.week.map((d) => ({
        key: d.key,
        label: d.key === today ? 'Today' : weekday.format(d.date),
        value: d.ms / 60000,
        display: formatDuration(d.ms),
        name: longDay.format(d.date),
      }))}
    />
  )
}

/** Seven dots, one per day, filled on days with coloring. */
export function StreakDots({ stats, color }: { stats: ProfileStats; color: string }) {
  return (
    <span className="flex gap-1.5" aria-hidden>
      {stats.week.map((d) => (
        <span
          key={d.key}
          className={cn('size-3 rounded-full', d.ms > 0 ? '' : 'bg-mist')}
          style={d.ms > 0 ? { backgroundColor: color } : undefined}
        />
      ))}
    </span>
  )
}

function Fact({ icon, children, sub }: { icon: ReactNode; children: ReactNode; sub?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-frost text-ink">{icon}</span>
      <span className="min-w-0">
        <span className="block font-semibold text-ink-deep">{children}</span>
        {sub ? <span className="mt-1 block text-[0.875rem] text-graphite">{sub}</span> : null}
      </span>
    </li>
  )
}

/** The chart plus the three facts kids care about: streak, finished pages, time this week. */
export function WeekPanel({ stats, color, you = true }: { stats: ProfileStats; color: string; you?: boolean }) {
  const days = stats.streak === 1 ? 'day' : 'days'
  return (
    <div className="grid gap-6 rounded-[28px] bg-paper p-5 shadow-paper sm:p-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] md:gap-10">
      <div>
        <h3 className="font-semibold text-ink-deep">Minutes colored each day</h3>
        <div className="mt-4">
          <WeekChart stats={stats} color={color} />
        </div>
      </div>
      <ul className="divide-y-2 divide-frost self-start">
        <Fact icon={<Flame className="size-5" />} sub={<StreakDots stats={stats} color={color} />}>
          {stats.streak > 0
            ? `${stats.streak} ${days} in a row`
            : you
              ? 'Color today to start a streak'
              : 'No streak right now'}
        </Fact>
        <Fact icon={<Star className="size-5" />} sub={stats.pagesStarted ? `${stats.pagesStarted} more in progress` : undefined}>
          {stats.pagesFinished === 1 ? '1 page finished' : `${stats.pagesFinished} pages finished`}
        </Fact>
        <Fact icon={<Clock className="size-5" />} sub={`${formatDuration(stats.totalMs)} in all`}>
          {formatDuration(stats.weekMs)} this week
        </Fact>
      </ul>
    </div>
  )
}

/** The colors used most, as crayon swatches with their hex in the tooltip. */
export function FavoriteColors({ stats }: { stats: ProfileStats }) {
  if (stats.favoriteColors.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-2.5" aria-label="Favorite colors">
      {stats.favoriteColors.map(({ color, count }) => (
        <li key={color} title={`${color}, used ${count} ${count === 1 ? 'time' : 'times'}`}>
          <span
            className="block size-10 rounded-full ring-2 ring-inset ring-black/5"
            style={{ backgroundColor: color, boxShadow: 'inset 0 -4px 0 rgb(0 0 0 / 0.12)' }}
          />
          <span className="sr-only">{color}</span>
        </li>
      ))}
    </ul>
  )
}
