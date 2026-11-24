import { ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Button, cn, Spinner } from '../components/ui'
import { api, type AuditEntry } from '../data/api'
import { useTitle } from '../lib/useTitle'
import { AdminHeader } from './AdminLayout'
import { formatDateTime, formatWhen } from './format'

/** Filters by action prefix (comma-separated prefixes go to the server as is). */
const FILTERS = [
  { id: 'all', label: 'Everything', action: '' },
  { id: 'users', label: 'Users', action: 'user.' },
  { id: 'books', label: 'Books', action: 'book.' },
  { id: 'plans', label: 'Plans', action: 'plan.,settings.' },
  { id: 'emails', label: 'Emails', action: 'email.' },
  { id: 'signins', label: 'Sign-ins', action: 'owner.signed_in' },
  { id: 'account', label: 'Account and roles', action: 'owner.created,owner.updated,role.' },
] as const

type FilterId = (typeof FILTERS)[number]['id']

export function AuditScreen() {
  useTitle('Audit log')
  const [filter, setFilter] = useState<FilterId>('all')
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [next, setNext] = useState<number | null>(null)
  const [state, setState] = useState<'loading' | 'more' | 'ready' | 'error'>('loading')
  const [error, setError] = useState('')

  const load = useCallback(
    async (before?: number) => {
      setState(before ? 'more' : 'loading')
      try {
        const action = FILTERS.find((f) => f.id === filter)!.action
        const res = await api.adminAudit({ before, action, limit: 50 })
        setEntries((prev) => (before ? [...prev, ...res.entries] : res.entries))
        setNext(res.nextBefore)
        setState('ready')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Couldn’t load the log.')
        setState('error')
      }
    },
    [filter],
  )
  useEffect(() => {
    void load()
  }, [load])

  return (
    <>
      <AdminHeader
        title="Audit log"
        intro="Every owner sign-in and every change made from the owner console or the owner:create command. Entries can’t be edited or deleted."
      />

      <div role="group" aria-label="Show" className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              'min-h-10 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors',
              filter === f.id ? 'bg-ink text-white' : 'bg-paper text-ink ring-1 ring-mist hover:ring-ink/40',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-mist">
        {state === 'loading' ? (
          <p className="flex items-center gap-3 px-6 py-8 text-graphite" role="status">
            <Spinner className="size-5" /> Loading…
          </p>
        ) : state === 'error' && entries.length === 0 ? (
          <div className="px-6 py-8" role="alert">
            <p className="font-semibold text-ink-deep">Couldn’t load the audit log.</p>
            <p className="mt-1 text-graphite">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : entries.length === 0 ? (
          <p className="px-6 py-8 text-graphite">Nothing recorded {filter === 'all' ? 'yet' : 'for this filter'}.</p>
        ) : (
          <ol className="divide-y divide-frost">
            {entries.map((e) => (
              <AuditRow key={e.id} entry={e} />
            ))}
          </ol>
        )}
      </div>

      {next !== null && state !== 'loading' ? (
        <div className="mt-5 flex justify-center">
          <Button variant="secondary" busy={state === 'more'} onClick={() => void load(next)}>
            Show older entries
          </Button>
        </div>
      ) : null}
    </>
  )
}

function AuditRow({ entry: e }: { entry: AuditEntry }) {
  const hasDetails = e.before != null || e.after != null || e.context != null || e.targetId != null
  return (
    <li>
      <details className="group">
        <summary
          className={cn(
            'grid cursor-pointer list-none grid-cols-[1fr_auto] items-start gap-x-4 gap-y-0.5 px-5 py-3.5 hover:bg-frost/50 sm:grid-cols-[11rem_1fr_auto] sm:px-6 [&::-webkit-details-marker]:hidden',
            !hasDetails && 'cursor-default',
          )}
        >
          <time dateTime={new Date(e.at).toISOString()} title={formatDateTime(e.at)} className="text-[0.9375rem] text-graphite sm:pt-px">
            {formatWhen(e.at)}
          </time>
          <span className="col-span-2 row-start-2 min-w-0 sm:col-span-1 sm:row-start-1 sm:col-start-2">
            <span className="block text-ink-deep">{e.summary}</span>
            <span className="block text-[0.875rem] text-graphite">by {e.actorLabel}</span>
          </span>
          {hasDetails ? (
            <ChevronDown aria-hidden className="size-5 text-graphite transition-transform group-open:rotate-180 sm:col-start-3" />
          ) : (
            <span />
          )}
        </summary>
        {hasDetails ? (
          <dl className="grid gap-x-6 gap-y-2 bg-snow px-5 py-4 text-[0.875rem] sm:grid-cols-[11rem_1fr] sm:px-6">
            <dt className="text-graphite">Action</dt>
            <dd className="font-mono text-ink-deep">{e.action}</dd>
            {e.targetId ? (
              <>
                <dt className="text-graphite">{e.targetType === 'user' ? 'Account' : (e.targetType ?? 'Target')}</dt>
                <dd className="font-mono break-all text-ink-deep">{e.targetId}</dd>
              </>
            ) : null}
            {e.context?.ip ? (
              <>
                <dt className="text-graphite">IP address</dt>
                <dd className="text-ink-deep">{e.context.ip}</dd>
              </>
            ) : null}
            {e.context?.browser ? (
              <>
                <dt className="text-graphite">Browser</dt>
                <dd className="break-words text-ink-deep">{e.context.browser}</dd>
              </>
            ) : null}
            {e.before != null ? (
              <>
                <dt className="text-graphite">Before</dt>
                <dd>
                  <Values value={e.before} />
                </dd>
              </>
            ) : null}
            {e.after != null ? (
              <>
                <dt className="text-graphite">After</dt>
                <dd>
                  <Values value={e.after} />
                </dd>
              </>
            ) : null}
          </dl>
        ) : null}
      </details>
    </li>
  )
}

/** A flat object as "key: value" pairs; anything nested as JSON. */
function Values({ value }: { value: unknown }) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <ul className="flex flex-col gap-0.5">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <li key={k} className="text-ink-deep">
            <span className="text-graphite">{k}:</span>{' '}
            <span className="font-mono break-all">{v === null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
          </li>
        ))}
      </ul>
    )
  }
  return <span className="font-mono break-all text-ink-deep">{JSON.stringify(value)}</span>
}
