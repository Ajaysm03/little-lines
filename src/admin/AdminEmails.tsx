import { CheckCircle2, CircleAlert, Send } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Dialog } from '../components/Dialog'
import { Button, cn, FormError, Spinner } from '../components/ui'
import { api, type EmailKind, type EmailOverview } from '../data/api'
import { useTitle } from '../lib/useTitle'
import { AdminHeader, Panel } from './AdminLayout'
import { formatDateTime, formatWhen } from './format'

type Template = 'welcome' | 'weekly' | 'new_book'

const TEMPLATES: Array<{ id: Template; label: string; when: string }> = [
  { id: 'welcome', label: 'Welcome', when: 'Sent once, when a family signs up.' },
  { id: 'weekly', label: 'Weekly progress', when: 'Mondays at 08:00 UTC, to families who colored, got a new book or have a trial ending. At most one a week.' },
  { id: 'new_book', label: 'New book', when: 'When you press “Announce to families” on a published book (in Books). Once per family per book.' },
]

export const KIND_LABEL: Record<EmailKind, string> = {
  welcome: 'Welcome',
  weekly: 'Weekly progress',
  new_book: 'New book',
  password_reset: 'Password reset',
  test: 'Test',
}

const HISTORY_FILTERS: Array<{ id: 'all' | EmailKind; label: string }> = [
  { id: 'all', label: 'Everything' },
  { id: 'welcome', label: 'Welcome' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'new_book', label: 'New book' },
  { id: 'password_reset', label: 'Password reset' },
  { id: 'test', label: 'Tests' },
]

export function AdminEmails() {
  useTitle('Emails')
  const [data, setData] = useState<EmailOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [template, setTemplate] = useState<Template>('welcome')
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null)
  const [busy, setBusy] = useState<null | 'test' | 'weekly'>(null)
  const [confirmWeekly, setConfirmWeekly] = useState(false)
  const [filter, setFilter] = useState<'all' | EmailKind>('all')

  const load = useCallback(async () => {
    setError(null)
    try {
      setData(await api.adminEmails())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load emails.')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    let live = true
    setPreview(null)
    api
      .adminEmailPreview(template)
      .then((p) => live && setPreview(p))
      .catch(() => live && setPreview({ subject: '', html: '<p style="font-family:sans-serif">Couldn’t load the preview.</p>' }))
    return () => {
      live = false
    }
  }, [template])

  async function act(kind: 'test' | 'weekly', fn: () => Promise<string>) {
    setBusy(kind)
    setActionError(null)
    setNotice(null)
    try {
      setNotice(await fn())
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const count = (kind: EmailKind | null, status?: string) =>
    (data?.counts ?? []).filter((c) => (kind === null || c.kind === kind) && (status ? c.status === status : c.status !== 'failed')).reduce((t, c) => t + c.n, 0)
  const t = TEMPLATES.find((x) => x.id === template)!
  const log = (data?.log ?? []).filter((e) => filter === 'all' || e.kind === filter)

  return (
    <>
      <AdminHeader title="Emails" intro="What families get from Little Lines, a preview of each email, and everything sent recently." />
      {notice ? (
        <p role="status" className="mt-5 rounded-2xl bg-meadow/12 px-4 py-3 text-[0.9375rem] text-ink-deep">
          {notice}
        </p>
      ) : null}
      {actionError ? (
        <div className="mt-5">
          <FormError>{actionError}</FormError>
        </div>
      ) : null}

      {error ? (
        <div className="mt-8 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t load emails.</p>
          <p className="mt-1 text-graphite">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <p className="mt-10 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Loading…
        </p>
      ) : (
        <div className="mt-8 flex flex-col gap-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Sending">
              <Status ok={data.configured}>
                {data.configured ? (
                  <>
                    Connected to Resend. Emails come from <span className="font-semibold">{data.from}</span>.
                  </>
                ) : (
                  <>Not connected: emails are written to the server log instead of sent. Add RESEND_API_KEY and EMAIL_FROM in Vercel to send them.</>
                )}
              </Status>
              <Status ok={data.cronConfigured}>
                {data.cronConfigured ? (
                  <>Weekly progress emails go out on Mondays at 08:00 UTC.</>
                ) : (
                  <>Weekly emails aren’t scheduled yet: add CRON_SECRET in Vercel. You can still send them from here.</>
                )}
              </Status>
            </Panel>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label="Sent in the last 30 days" value={count(null)} />
              <Stat label="Failed in the last 30 days" value={count(null, 'failed')} />
              <Stat label="Get weekly progress" value={data.subscribers.weekly} note={ofFamilies(data.subscribers.families)} />
              <Stat label="Get new book emails" value={data.subscribers.news} note={ofFamilies(data.subscribers.families)} />
            </dl>
          </div>

          <Panel title="Emails families get">
            <div role="tablist" aria-label="Email" className="flex flex-wrap gap-2">
              {TEMPLATES.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={template === x.id}
                  onClick={() => setTemplate(x.id)}
                  className={cn(
                    'min-h-10 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors',
                    template === x.id ? 'bg-ink text-white' : 'bg-snow text-ink ring-1 ring-mist hover:ring-ink/40',
                  )}
                >
                  {x.label}
                </button>
              ))}
            </div>
            <div role="tabpanel" className="mt-5 grid gap-5 xl:grid-cols-[1fr_17rem]">
              <div className="min-w-0 overflow-hidden rounded-2xl ring-1 ring-mist">
                <p className="border-b border-mist bg-snow px-4 py-2.5 text-[0.9375rem]">
                  <span className="text-graphite">Subject: </span>
                  <span className="font-semibold text-ink-deep">{preview?.subject ?? '…'}</span>
                </p>
                {preview ? (
                  <iframe title={`${t.label} email preview`} sandbox="" srcDoc={preview.html} className="h-[38rem] w-full bg-snow" />
                ) : (
                  <p className="flex h-[38rem] items-center justify-center gap-3 text-graphite">
                    <Spinner className="size-5" /> Loading preview…
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-[0.9375rem] text-ink-deep">{t.when}</p>
                <p className="text-[0.875rem] text-graphite">The preview uses sample names and numbers.</p>
                <Button
                  variant="secondary"
                  busy={busy === 'test'}
                  disabled={busy !== null}
                  onClick={() =>
                    act('test', async () => {
                      const r = await api.adminEmailTest(template)
                      return r.status === 'sent' ? `Test sent to ${r.to}.` : `Test written to the server log (Resend isn’t connected), for ${r.to}.`
                    })
                  }
                >
                  <Send className="size-5" /> Send a test to me
                </Button>
                {template === 'weekly' ? (
                  <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirmWeekly(true)}>
                    Send this week’s emails now
                  </Button>
                ) : null}
              </div>
            </div>
          </Panel>

          <Panel title="History" aside={<span className="text-[0.875rem] text-graphite">Latest 100</span>}>
            <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
              {HISTORY_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    'min-h-9 rounded-full px-3.5 text-[0.875rem] font-semibold transition-colors',
                    filter === f.id ? 'bg-ink text-white' : 'bg-snow text-ink ring-1 ring-mist hover:ring-ink/40',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {log.length ? (
              <div className="-mx-5 mt-4 overflow-x-auto sm:-mx-6">
                <table className="w-full min-w-[44rem] text-left text-[0.9375rem]">
                  <thead>
                    <tr className="border-b border-mist text-graphite">
                      <th scope="col" className="px-5 py-2.5 font-semibold sm:px-6">When</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Email</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">To</th>
                      <th scope="col" className="px-3 py-2.5 font-semibold">Subject</th>
                      <th scope="col" className="px-5 py-2.5 font-semibold sm:px-6">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {log.map((e) => (
                      <tr key={e.id} className="border-b border-frost align-top last:border-0">
                        <td className="px-5 py-3 whitespace-nowrap text-graphite sm:px-6" title={formatDateTime(e.at)}>
                          {formatWhen(e.at)}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-ink-deep">{KIND_LABEL[e.kind] ?? e.kind}</td>
                        <td className="px-3 py-3 text-ink-deep">{e.to}</td>
                        <td className="px-3 py-3 text-ink-deep">{e.subject}</td>
                        <td className="px-5 py-3 sm:px-6">
                          <ResultChip status={e.status} />
                          {e.error ? <span className="mt-1 block max-w-64 text-[0.8125rem] text-error">{e.error}</span> : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-graphite">No emails {filter === 'all' ? 'yet' : 'of this kind'}.</p>
            )}
          </Panel>
        </div>
      )}

      {confirmWeekly ? (
        <Dialog label="Send this week’s emails" onClose={() => setConfirmWeekly(false)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Send this week’s emails now?</h2>
          <p className="mt-2 text-graphite">
            Every family with weekly emails on gets this week’s summary, if they colored, have a new book or a trial ending. Families already sent one
            this week are skipped, so Monday’s run won’t send it twice.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={async () => {
                setConfirmWeekly(false)
                await act('weekly', async () => {
                  const r = await api.adminSendWeekly()
                  return `Weekly emails: ${r.sent} sent${r.skipped ? `, ${r.skipped} already sent this week` : ''}${r.failed ? `, ${r.failed} failed` : ''}.`
                })
              }}
            >
              Send now
            </Button>
            <Button variant="ghost" onClick={() => setConfirmWeekly(false)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      ) : null}
    </>
  )
}

const ofFamilies = (n: number) => `of ${n} ${n === 1 ? 'family' : 'families'}`

function Status({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const Icon = ok ? CheckCircle2 : CircleAlert
  return (
    <p className="mt-3 flex items-start gap-2.5 text-[0.9375rem] text-ink-deep first:mt-0">
      <Icon className={cn('mt-0.5 size-5 shrink-0', ok ? 'text-meadow-ink' : 'text-tangerine')} aria-label={ok ? 'Working' : 'Needs setup'} />
      <span>{children}</span>
    </p>
  )
}

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl bg-paper px-4 py-3.5 ring-1 ring-mist">
      <dt className="text-[0.875rem] leading-snug text-graphite">{label}</dt>
      <dd className="mt-1 font-display text-[1.625rem] leading-none font-bold text-ink-deep tabular-nums">{value}</dd>
      {note ? <dd className="mt-1.5 text-[0.8125rem] text-graphite">{note}</dd> : null}
    </div>
  )
}

function ResultChip({ status }: { status: 'sent' | 'logged' | 'failed' }) {
  const style = { sent: 'bg-meadow/14 text-meadow-ink', logged: 'bg-mist text-graphite', failed: 'bg-error/10 text-error' }[status]
  const label = { sent: 'Sent', logged: 'Logged only', failed: 'Failed' }[status]
  return <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap', style)}>{label}</span>
}
