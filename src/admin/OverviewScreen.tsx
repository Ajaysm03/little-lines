import { ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BarList, ColumnChart } from '../components/charts'
import { Button, Spinner } from '../components/ui'
import { api, type AdminOverview, type AuditEntry } from '../data/api'
import { computeDeviceStats, formatDuration } from '../data/analytics'
import { useTitle } from '../lib/useTitle'
import { getBook } from '../state/library-store'
import { AdminHeader, Panel } from './AdminLayout'
import { formatDate, formatWhen } from './format'

const WEEK = 7 * 24 * 60 * 60 * 1000

type Load<T> = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ready'; data: T }

function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []): [Load<T>, () => void] {
  const [result, setResult] = useState<Load<T>>({ state: 'loading' })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    setResult({ state: 'loading' })
    fn()
      .then((data) => live && setResult({ state: 'ready', data }))
      .catch((err: unknown) => live && setResult({ state: 'error', message: err instanceof Error ? err.message : 'Couldn’t load.' }))
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nonce, ...deps])
  return [result, () => setNonce((n) => n + 1)]
}

export function OverviewScreen() {
  useTitle('Owner console')
  const [overview, retry] = useLoad(() => api.adminOverview())
  const [audit] = useLoad(() => api.adminAudit({ limit: 5 }))

  return (
    <>
      <AdminHeader title="Overview" intro="Every family using Little Lines. Coloring activity covers the last 60 days." />
      {overview.state === 'loading' ? (
        <p className="mt-10 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Loading families…
        </p>
      ) : overview.state === 'error' ? (
        <div className="mt-8 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t load the overview.</p>
          <p className="mt-1 text-graphite">{overview.message}</p>
          <Button variant="secondary" className="mt-4" onClick={retry}>
            Try again
          </Button>
        </div>
      ) : (
        <OverviewBody overview={overview.data} audit={audit} />
      )}
    </>
  )
}

function OverviewBody({ overview, audit }: { overview: AdminOverview; audit: Load<{ entries: AuditEntry[] }> }) {
  const stats = useMemo(() => {
    const accounts = overview.families.map((f) => ({ id: f.id, name: f.name, email: f.email, role: f.role, lastLoginAt: f.lastLoginAt }))
    return computeDeviceStats(accounts, overview.profiles, overview.events, overview.pagesFinished)
  }, [overview])
  const now = Date.now()
  const newThisWeek = overview.families.filter((f) => f.createdAt > now - WEEK).length
  const joined = new Map(overview.families.map((f) => [f.id, f.createdAt]))
  const recentFamilies = [...stats.familyRows].sort((a, b) => (joined.get(b.id) ?? 0) - (joined.get(a.id) ?? 0)).slice(0, 8)
  const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
  const longFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="mt-8 flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <Stat label="Families" value={String(stats.families)} />
        <Stat label="New this week" value={String(newThisWeek)} />
        <Stat label="Children" value={String(stats.children)} />
        <Stat label="Children coloring this week" value={String(stats.activeChildren7d)} />
        <Stat label="Time coloring" value={formatDuration(stats.totalMs)} />
        <Stat label="Pages finished" value={String(stats.pagesFinished)} />
      </dl>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel title="Children coloring each day" aside={<span className="text-[0.875rem] text-graphite">Last 14 days</span>}>
          <ColumnChart
            caption="Children who colored on each of the last 14 days"
            color="#2b2f6b"
            data={stats.dailyActive.map((d, i) => ({
              key: d.key,
              label: i % 2 === 1 ? dayFmt.format(d.date) : '',
              value: d.count,
              display: d.count === 1 ? '1 child' : `${d.count} children`,
              name: longFmt.format(d.date),
            }))}
          />
        </Panel>
        <Panel title="Most-opened pages">
          {stats.popularPages.length ? (
            <BarList
              caption="Pages opened for coloring most often"
              color="#2b2f6b"
              rows={stats.popularPages.map((p) => {
                const page = getBook(p.bookId)?.pages.find((x) => x.id === p.pageId)
                return {
                  key: `${p.bookId}:${p.pageId}`,
                  label: page?.title ?? p.pageId,
                  value: p.opens,
                  display: `${p.opens} ${p.opens === 1 ? 'time' : 'times'}, ${formatDuration(p.ms).toLowerCase()}`,
                }
              })}
            />
          ) : (
            <p className="text-graphite">No pages opened in the last 60 days.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
        <Panel
          title="Newest families"
          aside={
            <Link to="/admin/users" className="inline-flex items-center gap-1 text-[0.9375rem] font-semibold text-ink hover:underline">
              All users <ChevronRight className="size-4" />
            </Link>
          }
        >
          {recentFamilies.length ? (
            <div className="-mx-5 overflow-x-auto sm:-mx-6">
              <table className="w-full min-w-[36rem] text-left text-[0.9375rem]">
                <thead>
                  <tr className="border-b border-mist text-graphite">
                    <th scope="col" className="px-5 py-2.5 font-semibold sm:px-6">Grown-up</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Joined</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Children</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Coloring</th>
                    <th scope="col" className="px-5 py-2.5 font-semibold sm:px-6">Last login</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFamilies.map((f) => (
                    <tr key={f.id} className="border-b border-frost last:border-0">
                      <td className="px-5 py-3 sm:px-6">
                        <span className="block font-semibold text-ink-deep">{f.name}</span>
                        <span className="block text-graphite">{f.email}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-ink-deep">{formatDate(joined.get(f.id) ?? 0)}</td>
                      <td className="px-3 py-3 text-right text-ink-deep tabular-nums">{f.children}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-ink-deep tabular-nums">{formatDuration(f.totalMs)}</td>
                      <td className="px-5 py-3 whitespace-nowrap text-ink-deep sm:px-6">{formatWhen(f.lastLoginAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-graphite">No families have signed up yet.</p>
          )}
        </Panel>

        <Panel
          title="Recent activity"
          aside={
            <Link to="/admin/audit" className="inline-flex items-center gap-1 text-[0.9375rem] font-semibold text-ink hover:underline">
              Audit log <ChevronRight className="size-4" />
            </Link>
          }
        >
          {audit.state === 'ready' ? (
            audit.data.entries.length ? (
              <ul className="flex flex-col gap-3">
                {audit.data.entries.map((e) => (
                  <li key={e.id} className="text-[0.9375rem]">
                    <span className="block text-ink-deep">{e.summary}</span>
                    <span className="block text-graphite">
                      {e.actorLabel}, {formatWhen(e.at)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-graphite">Nothing recorded yet.</p>
            )
          ) : audit.state === 'error' ? (
            <p className="text-graphite">{audit.message}</p>
          ) : (
            <Spinner className="size-5" />
          )}
        </Panel>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-paper px-4 py-3.5 ring-1 ring-mist">
      <dt className="text-[0.875rem] leading-snug text-graphite">{label}</dt>
      <dd className="mt-1 font-display text-[1.625rem] leading-none font-bold text-ink-deep tabular-nums">{value}</dd>
    </div>
  )
}
