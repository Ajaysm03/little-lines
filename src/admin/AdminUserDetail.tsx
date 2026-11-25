import { ArrowLeft, Ban, KeyRound, RotateCcw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { Button, FormError, Spinner, TextField } from '../components/ui'
import { api, ApiError, type AdminUserDetail as Detail } from '../data/api'
import { formatDuration } from '../data/analytics'
import { useTitle } from '../lib/useTitle'
import { getBook } from '../state/library-store'
import { Panel } from './AdminLayout'
import { PlanChip, PlanDialog } from './AdminPlans'
import { StatusChip } from './AdminUsers'
import { formatDate, formatDateTime, formatWhen } from './format'

export function AdminUserDetail() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState<Detail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [busy, setBusy] = useState<null | 'reset' | 'reactivate'>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [dialog, setDialog] = useState<null | 'plan' | 'suspend' | 'delete' | 'reset'>(null)
  useTitle(user?.name ?? 'User')

  const load = useCallback(async () => {
    setError(null)
    try {
      setUser(await api.adminUser(id))
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setNotFound(true)
      else setError(err instanceof Error ? err.message : 'Couldn’t load this account.')
    }
  }, [id])
  useEffect(() => {
    void load()
  }, [load])

  const back = (
    <Link to="/admin/users" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost">
      <ArrowLeft className="size-5" /> Users
    </Link>
  )
  if (notFound)
    return (
      <>
        {back}
        <p className="mt-6 text-graphite">This account doesn’t exist. It may have been deleted.</p>
      </>
    )
  if (error)
    return (
      <>
        {back}
        <div className="mt-6 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t load this account.</p>
          <p className="mt-1 text-graphite">{error}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </>
    )
  if (!user)
    return (
      <>
        {back}
        <p className="mt-8 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Loading…
        </p>
      </>
    )

  const childName = (pid: string | null) => user.children.find((c) => c.id === pid)?.name
  const suspended = user.status === 'suspended'

  async function act(kind: 'reset' | 'reactivate', fn: () => Promise<unknown>, done: string) {
    setBusy(kind)
    setActionError(null)
    setNotice(null)
    try {
      await fn()
      setNotice(done)
      await load()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {back}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="font-display text-title font-semibold text-ink-deep">{user.name}</h1>
        <StatusChip status={user.status} />
        <PlanChip plan={user.plan.effective} />
      </div>
      <p className="mt-1 text-graphite">{user.email}</p>

      {suspended ? (
        <p className="mt-5 rounded-2xl bg-error/8 px-4 py-3 text-[0.9375rem] text-ink-deep">
          Suspended {user.suspendedAt ? formatDate(user.suspendedAt) : ''}
          {user.suspendedReason ? `: ${user.suspendedReason}` : ''}. They can’t sign in until you reactivate the account.
        </p>
      ) : null}
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

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Children" aside={<span className="text-[0.875rem] text-graphite">{user.children.length}</span>}>
            {user.children.length ? (
              <ul className="flex flex-col divide-y divide-frost">
                {user.children.map((c) => (
                  <li key={c.id} className="flex items-center gap-4 py-3">
                    <Avatar avatar={c.avatar} color={c.color} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink-deep">
                        {c.name}
                        {c.hasPin ? <span className="ml-2 text-[0.8125rem] font-normal text-graphite">has a PIN</span> : null}
                      </p>
                      <p className="text-[0.9375rem] text-graphite">
                        {c.pagesColored} {c.pagesColored === 1 ? 'page' : 'pages'} colored, {c.pagesFinished} finished, {formatDuration(c.coloringMs).toLowerCase()} coloring
                      </p>
                    </div>
                    <span className="hidden text-right text-[0.875rem] text-graphite sm:block">
                      {c.lastActiveAt ? `Last active ${formatWhen(c.lastActiveAt).toLowerCase()}` : 'Not used yet'}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-graphite">No child profiles yet.</p>
            )}
          </Panel>

          <Panel title="Books">
            {user.books.length ? (
              <ul className="flex flex-col divide-y divide-frost">
                {user.books.map((b) => {
                  const book = getBook(b.bookId)
                  return (
                    <li key={b.bookId} className="flex items-center gap-4 py-3">
                      {book ? <img src={book.coverThumb} alt="" className="w-9 rounded-[2px_4px_4px_2px] shadow-book" /> : <span className="w-9" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink-deep">{book?.title ?? 'A book no longer in the library'}</p>
                        <p className="text-[0.9375rem] text-graphite">
                          {b.pagesColored} {b.pagesColored === 1 ? 'page' : 'pages'} colored, {b.pagesFinished} finished
                        </p>
                      </div>
                      <span className="text-[0.875rem] text-graphite">{formatWhen(b.lastAt)}</span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-graphite">They haven’t colored anything yet.</p>
            )}
          </Panel>

          <Panel title="Recent activity">
            {user.activity.length ? (
              <ol className="flex flex-col gap-2.5">
                {user.activity.map((e, i) => (
                  <li key={i} className="grid grid-cols-[9rem_1fr] gap-3 text-[0.9375rem]">
                    <time className="text-graphite" dateTime={new Date(e.at).toISOString()} title={formatDateTime(e.at)}>
                      {formatWhen(e.at)}
                    </time>
                    <span className="text-ink-deep">{describe(e, childName(e.profileId))}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-graphite">No activity yet.</p>
            )}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Account">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.9375rem]">
              <dt className="text-graphite">Joined</dt>
              <dd className="text-ink-deep">{formatDate(user.joinedAt)}</dd>
              <dt className="text-graphite">Last login</dt>
              <dd className="text-ink-deep">{user.lastLoginAt ? formatWhen(user.lastLoginAt) : 'Not since joining'}</dd>
              <dt className="text-graphite">Last coloring</dt>
              <dd className="text-ink-deep">{user.lastColoringAt ? formatWhen(user.lastColoringAt) : 'Never'}</dd>
              <dt className="text-graphite">Coloring time</dt>
              <dd className="text-ink-deep">{formatDuration(user.coloringMs)}</dd>
              <dt className="text-graphite">Signs in with</dt>
              <dd className="text-ink-deep">{user.signInMethods.map((m) => (m === 'google' ? 'Google' : 'Password')).join(' and ') || '—'}</dd>
            </dl>
          </Panel>

          <Panel title="Plan">
            <p className="text-ink-deep">
              <PlanChip plan={user.plan.effective} />
              <span className="ml-2 text-[0.9375rem] text-graphite">
                {user.plan.effective === 'free'
                  ? user.plan.plan !== 'free' && user.plan.endsAt
                    ? `${user.plan.plan === 'trial' ? 'Trial' : 'Premium'} ended ${formatDate(user.plan.endsAt)}`
                    : 'Premium books locked'
                  : user.plan.endsAt
                    ? `until ${formatDate(user.plan.endsAt)}`
                    : 'no end date'}
              </span>
            </p>
            {user.plan.note ? <p className="mt-2 text-[0.9375rem] text-graphite">Note: {user.plan.note}</p> : null}
            <Button variant="secondary" className="mt-4" onClick={() => setDialog('plan')}>
              Change, extend or gift
            </Button>
          </Panel>

          <Panel title="Actions">
            <div className="flex flex-col items-start gap-2">
              <Button variant="ghost" disabled={busy !== null || suspended || !user.signInMethods.includes('password')} onClick={() => setDialog('reset')}>
                <KeyRound className="size-5" /> Send a password reset
              </Button>
              {!user.signInMethods.includes('password') ? (
                <p className="-mt-1 mb-1 px-3 text-[0.875rem] text-graphite">They sign in with Google only, so there’s no password to reset.</p>
              ) : null}
              {suspended ? (
                <Button
                  variant="ghost"
                  busy={busy === 'reactivate'}
                  disabled={busy !== null}
                  onClick={() => act('reactivate', () => api.adminReactivate(user.id), `${user.name} can sign in again.`)}
                >
                  <RotateCcw className="size-5" /> Reactivate account
                </Button>
              ) : (
                <Button variant="ghost" disabled={busy !== null} onClick={() => setDialog('suspend')}>
                  <Ban className="size-5" /> Suspend account
                </Button>
              )}
              <Button variant="danger" className="mt-3" disabled={busy !== null} onClick={() => setDialog('delete')}>
                <Trash2 className="size-5" /> Delete account
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      {dialog === 'plan' ? (
        <PlanDialog
          family={{ ...user.plan, id: user.id, name: user.name, email: user.email, joinedAt: user.joinedAt }}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null)
            setNotice('Plan saved.')
            void load()
          }}
        />
      ) : null}
      {dialog === 'reset' ? (
        <Dialog label="Send a password reset" onClose={() => setDialog(null)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Send a password reset?</h2>
          <p className="mt-2 text-graphite">
            {user.email} gets an email with a link to choose a new password. The link works for one hour. Their current password keeps
            working until they use it.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              busy={busy === 'reset'}
              onClick={async () => {
                setDialog(null)
                await act('reset', () => api.adminSendReset(user.id), `Password reset email sent to ${user.email}.`)
              }}
            >
              Send email
            </Button>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      ) : null}
      {dialog === 'suspend' ? (
        <SuspendDialog
          name={user.name}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const next = await api.adminSuspend(user.id, reason)
            setUser(next)
            setDialog(null)
            setNotice(`${user.name} is suspended and was signed out everywhere.`)
          }}
        />
      ) : null}
      {dialog === 'delete' ? (
        <DeleteDialog
          name={user.name}
          email={user.email}
          onClose={() => setDialog(null)}
          onConfirm={async (typed) => {
            await api.adminDeleteUser(user.id, typed)
            navigate('/admin/users', { replace: true })
          }}
        />
      ) : null}
    </>
  )
}

function describe(e: Detail['activity'][number], child?: string) {
  const book = e.bookId ? getBook(e.bookId) : undefined
  const page = book?.pages.find((p) => p.id === e.pageId)
  const who = child ?? 'A child'
  const bookName = book?.title ?? 'a book'
  const pageName = page?.title ?? 'a page'
  switch (e.type) {
    case 'book_open':
      return `${who} opened ${bookName}`
    case 'page_turn':
      return `${who} turned pages in ${bookName}`
    case 'color_open':
      return `${who} opened ${pageName} to color`
    case 'coloring':
      return `${who} colored ${pageName}${e.ms ? ` for ${formatDuration(e.ms).toLowerCase()}` : ''}`
    default:
      return `${who}: ${e.type.replace(/_/g, ' ')}`
  }
}

function SuspendDialog({ name, onClose, onConfirm }: { name: string; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog label="Suspend account" onClose={onClose}>
      <h2 className="font-display text-heading font-bold text-ink-deep">Suspend {name}?</h2>
      <p className="mt-2 text-graphite">
        They’re signed out on every device and can’t sign in until you reactivate the account. Nothing is deleted.
      </p>
      <TextField className="mt-5" label="Reason (only you see it)" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
      {error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="danger"
          busy={busy}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm(reason)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Couldn’t suspend the account.')
              setBusy(false)
            }
          }}
        >
          <Ban className="size-5" /> Suspend account
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Dialog>
  )
}

function DeleteDialog({ name, email, onClose, onConfirm }: { name: string; email: string; onClose: () => void; onConfirm: (typed: string) => Promise<void> }) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Dialog label="Delete account" onClose={onClose}>
      <h2 className="font-display text-heading font-bold text-ink-deep">Delete {name}’s account?</h2>
      <p className="mt-2 text-graphite">
        The account, its children, every coloring and all activity are deleted from Little Lines for good, and they’re signed out
        everywhere. This can’t be undone. To stop them signing in but keep their data, suspend the account instead.
      </p>
      <TextField className="mt-5" label={`Type ${email} to confirm`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
      {error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}
      <div className="mt-6 flex flex-col gap-3">
        <Button
          variant="danger"
          busy={busy}
          disabled={typed.trim().toLowerCase() !== email.toLowerCase()}
          onClick={async () => {
            setBusy(true)
            setError(null)
            try {
              await onConfirm(typed)
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Couldn’t delete the account.')
              setBusy(false)
            }
          }}
        >
          <Trash2 className="size-5" /> Delete permanently
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
      </div>
    </Dialog>
  )
}
