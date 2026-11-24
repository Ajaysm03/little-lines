import { Search } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Button, cn, FormError, Spinner } from '../components/ui'
import { api, type PlanName, type PlanRow } from '../data/api'
import { PLAN_NAMES } from '../data/plans'
import { useTitle } from '../lib/useTitle'
import { AdminHeader, Panel } from './AdminLayout'
import { formatDate } from './format'

const DAY = 86_400_000
const FILTERS = [
  { id: 'all', label: 'Everyone' },
  { id: 'premium', label: 'Premium' },
  { id: 'trial', label: 'Trial' },
  { id: 'free', label: 'Free' },
] as const
type FilterId = (typeof FILTERS)[number]['id']

export function AdminPlans() {
  useTitle('Plans')
  const [data, setData] = useState<{ trialDays: number; families: PlanRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<PlanRow | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.adminPlans())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load plans.')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const now = Date.now()
  const families = data?.families ?? []
  const counts = {
    all: families.length,
    premium: families.filter((f) => f.effective === 'premium').length,
    trial: families.filter((f) => f.effective === 'trial').length,
    free: families.filter((f) => f.effective === 'free').length,
  }
  const endingSoon = families.filter((f) => f.effective !== 'free' && f.endsAt && f.endsAt - now < 7 * DAY).length
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return families.filter((f) => (filter === 'all' || f.effective === filter) && (!q || f.name.toLowerCase().includes(q) || f.email.toLowerCase().includes(q)))
  }, [families, filter, search])

  return (
    <>
      <AdminHeader
        title="Plans"
        intro="Free, Trial or Premium for each family. Trial and Premium unlock Premium books; when their end date passes, the family is on Free again automatically."
      />
      {notice ? (
        <p role="status" className="mt-5 rounded-2xl bg-meadow/12 px-4 py-3 text-[0.9375rem] text-ink-deep">
          {notice}
        </p>
      ) : null}

      {error ? (
        <div className="mt-8 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t load plans.</p>
          <p className="mt-1 text-graphite">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <p className="mt-10 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Loading plans…
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Premium" value={counts.premium} />
            <Stat label="On a trial" value={counts.trial} />
            <Stat label="Free" value={counts.free} />
            <Stat label="Ending in the next 7 days" value={endingSoon} />
          </dl>

          <TrialSetting
            days={data.trialDays}
            onSaved={(d) => {
              setData({ ...data, trialDays: d })
              setNotice(d === 0 ? 'Trials are off: new families start on Free.' : `New families now get a ${d}-day trial.`)
            }}
          />

          <Panel title="Families">
            <div className="flex flex-wrap items-center gap-3">
              <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
                {FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-pressed={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn(
                      'min-h-10 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors',
                      filter === f.id ? 'bg-ink text-white' : 'bg-snow text-ink ring-1 ring-mist hover:ring-ink/40',
                    )}
                  >
                    {f.label} <span className={cn('ml-1 tabular-nums', filter === f.id ? 'text-white/75' : 'text-graphite')}>{counts[f.id]}</span>
                  </button>
                ))}
              </div>
              <label className="relative ml-auto w-full sm:w-64">
                <span className="sr-only">Search families</span>
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-graphite" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name or email"
                  className="min-h-10 w-full rounded-full bg-snow pr-4 pl-9 text-[0.9375rem] text-ink-deep ring-1 ring-mist outline-none focus:ring-2 focus:ring-sky"
                />
              </label>
            </div>

            {shown.length === 0 ? (
              <p className="mt-5 text-graphite">{families.length ? 'No families match.' : 'No families have signed up yet.'}</p>
            ) : (
              <div className="-mx-5 mt-4 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[40rem] text-left text-[0.9375rem]">
                  <thead>
                    <tr className="border-b border-mist text-graphite">
                      <th scope="col" className="px-5 py-2.5 font-semibold sm:px-6">Family</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Plan</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Until</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Note</th>
                      <th scope="col" className="px-5 py-2.5 sm:px-6">
                        <span className="sr-only">Change</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((f) => (
                      <tr key={f.id} className="border-b border-frost last:border-0">
                        <td className="px-5 py-3 sm:px-6">
                          <span className="block font-semibold text-ink-deep">{f.name}</span>
                          <span className="block text-graphite">{f.email}</span>
                        </td>
                        <td className="px-3 py-3">
                          <PlanChip plan={f.effective} />
                          {f.plan !== f.effective ? (
                            <span className="mt-0.5 block text-[0.8125rem] text-graphite">{PLAN_NAMES[f.plan]} ended</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-ink-deep">
                          {f.effective === 'free' ? '—' : f.endsAt ? formatDate(f.endsAt) : 'No end date'}
                        </td>
                        <td className="max-w-56 px-3 py-3 text-graphite">
                          <span className="line-clamp-2">{f.note ?? ''}</span>
                        </td>
                        <td className="px-5 py-3 text-right sm:px-6">
                          <Button variant="secondary" className="min-h-10 px-4" onClick={() => setEditing(f)} aria-label={`Change plan for ${f.name}`}>
                            Change
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      )}

      {editing ? (
        <PlanDialog
          family={editing}
          onClose={() => setEditing(null)}
          onSaved={(name) => {
            setEditing(null)
            setNotice(`Plan saved for ${name}.`)
            void load()
          }}
        />
      ) : null}
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

export function PlanChip({ plan }: { plan: PlanName }) {
  const style = { premium: 'bg-sunflower/30 text-ink-deep', trial: 'bg-sky/12 text-ink', free: 'bg-mist text-graphite' }[plan]
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold', style)}>{PLAN_NAMES[plan]}</span>
}

function TrialSetting({ days, onSaved }: { days: number; onSaved: (d: number) => void }) {
  const id = useId()
  const [value, setValue] = useState(String(days))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const n = Number(value)
  const valid = value.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 365
  return (
    <Panel title="New families">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!valid) return setError('Use a whole number of days from 0 to 365.')
          setBusy(true)
          setError(null)
          try {
            onSaved((await api.adminSetTrialDays(n)).trialDays)
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Couldn’t save.')
          } finally {
            setBusy(false)
          }
        }}
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id} className="font-semibold text-ink-deep">
            Trial length
          </label>
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="number"
              min={0}
              max={365}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-h-12 w-24 rounded-2xl bg-paper px-4 text-[1.0625rem] text-ink-deep ring-2 ring-mist outline-none ring-inset focus:ring-sky"
            />
            <span className="text-graphite">days</span>
          </div>
        </div>
        <Button type="submit" variant="secondary" busy={busy} disabled={!valid || n === days}>
          Save
        </Button>
        <p className="basis-full text-[0.9375rem] text-graphite">
          Every new family starts on a trial this long, with Premium books unlocked. Set 0 to start new families on Free. Families who already signed up keep their current plan.
        </p>
        {error ? (
          <div className="basis-full">
            <FormError>{error}</FormError>
          </div>
        ) : null}
      </form>
    </Panel>
  )
}

const toInputDate = (t: number) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** The end of the chosen day, in this browser's time zone. */
const fromInputDate = (v: string) => {
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d, 23, 59, 59).getTime()
}

/** Change one family's plan: Free, Trial (needs an end date) or Premium (end date optional), with a note. */
export function PlanDialog({ family, onClose, onSaved }: { family: PlanRow; onClose: () => void; onSaved: (name: string) => void }) {
  const id = useId()
  const now = Date.now()
  const [plan, setPlan] = useState<PlanName>(family.effective === 'free' ? 'premium' : family.plan)
  const [noEnd, setNoEnd] = useState(family.plan === 'premium' && family.endsAt === null)
  const [end, setEnd] = useState(toInputDate(family.effective !== 'free' && family.endsAt ? family.endsAt : now + 30 * DAY))
  const [note, setNote] = useState(family.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsDate = plan === 'trial' || (plan === 'premium' && !noEnd)
  const extend = (days: number) => {
    const base = Math.max(now, end ? fromInputDate(end) : now)
    setEnd(toInputDate(base + days * DAY))
    setNoEnd(false)
  }

  async function save() {
    setError(null)
    const endsAt = needsDate ? (end ? fromInputDate(end) : NaN) : null
    if (needsDate && (!Number.isFinite(endsAt) || (endsAt as number) <= Date.now())) return setError('Choose an end date in the future.')
    setBusy(true)
    try {
      await api.adminSetPlan(family.id, { plan, endsAt, note })
      onSaved(family.name)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save the plan.')
      setBusy(false)
    }
  }

  return (
    <Dialog label={`Plan for ${family.name}`} onClose={onClose}>
      <h2 className="font-display text-heading font-bold text-ink-deep">Plan for {family.name}</h2>
      <p className="mt-1 text-graphite">
        Now: {PLAN_NAMES[family.effective]}
        {family.effective !== 'free' && family.endsAt ? ` until ${formatDate(family.endsAt)}` : ''}
        {family.plan !== family.effective ? ` (${PLAN_NAMES[family.plan]} ended)` : ''}.
      </p>

      <div role="radiogroup" aria-label="Plan" className="mt-5 grid grid-cols-3 gap-1 rounded-full bg-frost p-1">
        {(['free', 'trial', 'premium'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={plan === p}
            onClick={() => setPlan(p)}
            className={cn('min-h-10 rounded-full text-[0.9375rem] font-semibold', plan === p ? 'bg-paper text-ink-deep shadow-sm' : 'text-graphite hover:text-ink')}
          >
            {PLAN_NAMES[p]}
          </button>
        ))}
      </div>

      {plan === 'free' ? (
        <p className="mt-4 text-graphite">Premium books will be locked for this family.</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          {plan === 'premium' ? (
            <label className="flex items-center gap-2 text-ink-deep">
              <input type="checkbox" checked={noEnd} onChange={(e) => setNoEnd(e.target.checked)} className="size-5 accent-ink" />
              No end date
            </label>
          ) : null}
          {needsDate ? (
            <>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-end`} className="font-semibold text-ink-deep">
                  Until the end of
                </label>
                <input
                  id={`${id}-end`}
                  type="date"
                  value={end}
                  min={toInputDate(now + DAY)}
                  onChange={(e) => setEnd(e.target.value)}
                  className="min-h-12 rounded-2xl bg-paper px-4 text-[1.0625rem] text-ink-deep ring-2 ring-mist outline-none ring-inset focus:ring-sky"
                />
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Extend by">
                {[
                  { label: '+14 days', days: 14 },
                  { label: '+1 month', days: 30 },
                  { label: '+1 year', days: 365 },
                ].map((x) => (
                  <button key={x.label} type="button" onClick={() => extend(x.days)} className="min-h-9 rounded-full bg-snow px-3 text-[0.875rem] font-semibold text-ink ring-1 ring-mist hover:ring-ink/40">
                    {x.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-1.5">
        <label htmlFor={`${id}-note`} className="font-semibold text-ink-deep">
          Note <span className="font-normal text-graphite">(only you see it)</span>
        </label>
        <textarea
          id={`${id}-note`}
          rows={2}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Gifted for helping test the app"
          className="rounded-2xl bg-paper px-4 py-3 text-[1rem] text-ink-deep ring-2 ring-mist outline-none ring-inset focus:ring-sky"
        />
      </div>

      {error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <Button busy={busy} onClick={save}>
          Save plan
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}
