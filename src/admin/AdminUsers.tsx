import { ChevronLeft, ChevronRight, Download, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { Button, cn, Spinner } from '../components/ui'
import { api, type AdminUser, type UserStatus } from '../data/api'
import { formatDuration } from '../data/analytics'
import { PLAN_NAMES } from '../data/plans'
import { useTitle } from '../lib/useTitle'
import { AdminHeader } from './AdminLayout'
import { PlanChip } from './AdminPlans'
import { formatDate, formatWhen } from './format'

const PAGE_SIZE = 25
const DAY = 86_400_000

export const STATUS_LABEL: Record<UserStatus, string> = {
  active: 'Active',
  inactive: 'Inactive',
  'never-started': 'Never started',
  suspended: 'Suspended',
}

export function StatusChip({ status }: { status: UserStatus }) {
  const style = {
    active: 'bg-meadow/14 text-meadow-ink',
    inactive: 'bg-mist text-graphite',
    'never-started': 'bg-sky/12 text-ink',
    suspended: 'bg-error/10 text-error',
  }[status]
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap', style)}>{STATUS_LABEL[status]}</span>
}

const SORTS = {
  newest: { label: 'Newest first', fn: (a: AdminUser, b: AdminUser) => b.joinedAt - a.joinedAt },
  oldest: { label: 'Oldest first', fn: (a: AdminUser, b: AdminUser) => a.joinedAt - b.joinedAt },
  active: { label: 'Recently active', fn: (a: AdminUser, b: AdminUser) => lastSeen(b) - lastSeen(a) },
  name: { label: 'Name, A to Z', fn: (a: AdminUser, b: AdminUser) => a.name.localeCompare(b.name) },
  pages: { label: 'Most pages colored', fn: (a: AdminUser, b: AdminUser) => b.pagesColored - a.pagesColored },
} as const
type SortId = keyof typeof SORTS

const JOINED = { any: 'Any time', '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days' } as const
type JoinedId = keyof typeof JOINED

const lastSeen = (u: AdminUser) => Math.max(u.lastLoginAt ?? 0, u.lastColoringAt ?? 0)

export function AdminUsers() {
  useTitle('Users')
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [inactiveDays, setInactiveDays] = useState(30)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<UserStatus | 'all'>('all')
  const [plan, setPlan] = useState<'all' | 'free' | 'trial' | 'premium'>('all')
  const [joined, setJoined] = useState<JoinedId>('any')
  const [sort, setSort] = useState<SortId>('newest')
  const [page, setPage] = useState(0)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await api.adminUsers()
      setUsers(res.users)
      setInactiveDays(res.inactiveAfterDays)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the users.')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const all = useMemo(() => users ?? [], [users])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const since = joined === 'any' ? 0 : Date.now() - Number(joined) * DAY
    return all
      .filter(
        (u) =>
          (status === 'all' || u.status === status) &&
          (plan === 'all' || u.plan.effective === plan) &&
          u.joinedAt >= since &&
          (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)),
      )
      .sort(SORTS[sort].fn)
  }, [all, search, status, plan, joined, sort])
  useEffect(() => setPage(0), [search, status, plan, joined, sort])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const count = (s: UserStatus) => all.filter((u) => u.status === s).length

  return (
    <>
      <AdminHeader
        title="Users"
        intro={`Every family account. Active means they signed in or colored in the last ${inactiveDays} days; Never started means no coloring yet.`}
        actions={
          <Button variant="secondary" onClick={() => downloadCsv(filtered)} disabled={!filtered.length}>
            <Download className="size-5" /> Export CSV
          </Button>
        }
      />

      {error ? (
        <div className="mt-8 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t load the users.</p>
          <p className="mt-1 text-graphite">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !users ? (
        <p className="mt-10 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Loading users…
        </p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="Families" value={all.length} />
            <Stat label="Active" value={count('active')} />
            <Stat label="Inactive" value={count('inactive')} />
            <Stat label="Never started" value={count('never-started')} />
            <Stat label="Suspended" value={count('suspended')} />
          </dl>

          <div className="mt-6 flex flex-wrap items-end gap-3">
            <label className="relative w-full sm:w-72">
              <span className="sr-only">Search users</span>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-graphite" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                className="min-h-11 w-full rounded-full bg-paper pr-4 pl-10 text-[0.9375rem] text-ink-deep ring-1 ring-mist outline-none focus:ring-2 focus:ring-sky"
              />
            </label>
            <Select label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={[['all', 'All'], ...Object.entries(STATUS_LABEL)]} />
            <Select label="Plan" value={plan} onChange={(v) => setPlan(v as typeof plan)} options={[['all', 'All'], ...Object.entries(PLAN_NAMES)]} />
            <Select label="Joined" value={joined} onChange={(v) => setJoined(v as JoinedId)} options={Object.entries(JOINED)} />
            <Select label="Sort" value={sort} onChange={(v) => setSort(v as SortId)} options={Object.entries(SORTS).map(([k, v]) => [k, v.label])} />
          </div>

          <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-mist">
            {shown.length === 0 ? (
              <p className="px-6 py-8 text-graphite">{all.length ? 'No users match these filters.' : 'No families have signed up yet.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-left text-[0.9375rem]">
                  <thead>
                    <tr className="border-b border-mist text-graphite">
                      <th scope="col" className="px-5 py-3 font-semibold">Family</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Plan</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Joined</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Last login</th>
                      <th scope="col" className="px-3 py-3 font-semibold">Last coloring</th>
                      <th scope="col" className="px-3 py-3 text-right font-semibold">Children</th>
                      <th scope="col" className="px-5 py-3 text-right font-semibold">Pages colored</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((u) => (
                      <tr
                        key={u.id}
                        onClick={() => navigate(`/admin/users/${u.id}`)}
                        className="cursor-pointer border-b border-frost last:border-0 hover:bg-frost/50"
                      >
                        <td className="px-5 py-3">
                          <a
                            href={`/admin/users/${u.id}`}
                            onClick={(e) => {
                              e.preventDefault()
                              navigate(`/admin/users/${u.id}`)
                            }}
                            className="block font-semibold text-ink-deep hover:underline"
                          >
                            {u.name}
                          </a>
                          <span className="block text-graphite">{u.email}</span>
                        </td>
                        <td className="px-3 py-3">
                          <StatusChip status={u.status} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <PlanChip plan={u.plan.effective} />
                          {u.plan.effective !== 'free' && u.plan.endsAt ? (
                            <span className="ml-1.5 text-[0.8125rem] text-graphite">to {formatDate(u.plan.endsAt)}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-ink-deep">{formatDate(u.joinedAt)}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-ink-deep">{u.lastLoginAt ? formatWhen(u.lastLoginAt) : '—'}</td>
                        <td className="px-3 py-3 whitespace-nowrap text-ink-deep">{u.lastColoringAt ? formatWhen(u.lastColoringAt) : '—'}</td>
                        <td className="px-3 py-3 text-right text-ink-deep tabular-nums">{u.children}</td>
                        <td className="px-5 py-3 text-right text-ink-deep tabular-nums">{u.pagesColored}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[0.9375rem] text-graphite" role="status">
              {filtered.length
                ? `Showing ${page * PAGE_SIZE + 1}–${Math.min(filtered.length, (page + 1) * PAGE_SIZE)} of ${filtered.length}`
                : 'No matches'}
            </p>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                <Button variant="secondary" className="min-h-10 px-3" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page">
                  <ChevronLeft className="size-5" />
                </Button>
                <span className="text-[0.9375rem] text-ink-deep tabular-nums">
                  Page {page + 1} of {pages}
                </span>
                <Button variant="secondary" className="min-h-10 px-3" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Next page">
                  <ChevronRight className="size-5" />
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-paper px-4 py-3.5 ring-1 ring-mist">
      <dt className="text-[0.875rem] leading-snug text-graphite">{label}</dt>
      <dd className="mt-1 font-display text-[1.625rem] leading-none font-bold text-ink-deep tabular-nums">{value}</dd>
    </div>
  )
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> | string[][] }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.8125rem] font-semibold text-graphite">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 rounded-full bg-paper px-4 text-[0.9375rem] text-ink-deep ring-1 ring-mist outline-none focus:ring-2 focus:ring-sky"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  )
}

/** The rows on screen (after filters, all pages) as a CSV file. */
function downloadCsv(rows: AdminUser[]) {
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : '')
  const head = ['Name', 'Email', 'Status', 'Plan', 'Plan ends', 'Joined', 'Last login', 'Last coloring', 'Children', 'Pages colored', 'Pages finished', 'Coloring time', 'Sign-in']
  const lines = rows.map((u) => [
    u.name,
    u.email,
    STATUS_LABEL[u.status],
    PLAN_NAMES[u.plan.effective],
    u.plan.effective !== 'free' ? iso(u.plan.endsAt) : '',
    iso(u.joinedAt),
    iso(u.lastLoginAt),
    iso(u.lastColoringAt),
    String(u.children),
    String(u.pagesColored),
    String(u.pagesFinished),
    formatDuration(u.coloringMs),
    u.signInMethods.map((m) => (m === 'google' ? 'Google' : 'Password')).join(' + '),
  ])
  // Quote every cell; a leading = + - @ is prefixed so spreadsheets don't run it as a formula.
  const cell = (v: string) => `"${(/^[=+\-@]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`
  const csv = [head, ...lines].map((r) => r.map(cell).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `little-lines-users-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
