import { ArrowLeft, BarChart3, ChevronRight, FileUp, KeyRound, Lock, LogOut, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { Button, ButtonLink } from '../components/ui'
import type { Book } from '../content/books'
import { changeParentPin, MAX_PROFILES, verifyParentPin } from '../data/accounts'
import { deleteImportedBook } from '../data/imported-books'
import { useProfiles } from '../state/hooks'
import { useBooks, useLibrary } from '../state/library-store'
import { useSession } from '../state/session-store'
import { useSync } from '../sync/sync'
import { ChildSummaryRow } from './InsightsScreens'
import { useTitle } from '../lib/useTitle'

function formatDate(ms: number | null) {
  if (!ms) return 'Not yet'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(ms)
}

export function GrownUps() {
  const account = useSession((s) => s.account)!
  useTitle('Grown-ups')
  const profileId = useSession((s) => s.profileId)
  const logOut = useSession((s) => s.logOut)
  const lockParent = useSession((s) => s.lockParent)
  const profiles = useProfiles() ?? []
  const navigate = useNavigate()
  const [pinStep, setPinStep] = useState<null | 'current' | 'next'>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const books = useBooks()
  const reloadLibrary = useLibrary((s) => s.load)
  const [removing, setRemoving] = useState<Book | null>(null)

  function done() {
    lockParent()
    navigate(profileId ? '/home' : '/profiles')
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 pt-6 pb-12 sm:px-8">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={done}
          className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost"
        >
          <ArrowLeft className="size-5" /> {profileId ? 'Back to coloring' : 'Back to profiles'}
        </button>
        <span className="inline-flex items-center gap-1.5 text-[0.9375rem] text-graphite">
          <Lock className="size-4" /> Locks again when you leave
        </span>
      </div>

      <h1 className="mt-8 font-display text-title font-extrabold text-ink-deep">Grown-ups</h1>
      <p className="mt-1 text-graphite">
        Signed in as {account.name} ({account.email})
      </p>

      {notice ? (
        <p role="status" className="mt-6 rounded-2xl bg-meadow/12 px-4 py-3 text-[0.9375rem] text-ink-deep">
          {notice}
        </p>
      ) : null}

      <section className="mt-10" aria-labelledby="profiles-h">
        <div className="flex items-end justify-between gap-4">
          <h2 id="profiles-h" className="font-display text-heading font-bold text-ink-deep">
            Profiles
          </h2>
          <span className="text-[0.9375rem] text-graphite">
            {profiles.length} of {MAX_PROFILES}
          </span>
        </div>
        <ul className="mt-4 divide-y-2 divide-frost overflow-hidden rounded-3xl bg-paper ring-2 ring-inset ring-mist">
          {profiles.map((p) => (
            <li key={p.id} className="flex items-center gap-4 px-5 py-4">
              <Avatar avatar={p.avatar} color={p.color} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-deep">
                  {p.name}
                  {p.pinHash ? <Lock className="ml-2 inline size-4 text-graphite" aria-label="Has a PIN" /> : null}
                </p>
                <p className="text-[0.9375rem] text-graphite">Last opened: {formatDate(p.lastActiveAt)}</p>
              </div>
              <ButtonLink to={`/profiles/${p.id}/edit`} state={{ from: '/grown-ups' }} variant="secondary">
                <Pencil className="size-4" /> Edit
              </ButtonLink>
            </li>
          ))}
          {profiles.length === 0 ? (
            <li className="px-5 py-6 text-graphite">No profiles yet. Add one for each child.</li>
          ) : null}
        </ul>
        {profiles.length < MAX_PROFILES ? (
          <ButtonLink to="/profiles/new" state={{ from: '/grown-ups' }} variant="secondary" className="mt-4">
            <Plus className="size-5" /> Add a profile
          </ButtonLink>
        ) : null}
      </section>

      <section className="mt-12" aria-labelledby="insights-h">
        <h2 id="insights-h" className="font-display text-heading font-bold text-ink-deep">
          Insights
        </h2>
        {profiles.length ? (
          <ul className="mt-4 divide-y-2 divide-frost overflow-hidden rounded-3xl bg-paper ring-2 ring-inset ring-mist">
            {profiles.map((p) => (
              <ChildSummaryRow key={p.id} profile={p} />
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-graphite">Add a profile to see each child’s coloring time, pages and stickers.</p>
        )}
        {account.role === 'admin' ? (
          <Link
            to="/grown-ups/device"
            className="mt-4 flex items-center gap-4 rounded-3xl bg-paper px-5 py-4 ring-2 ring-inset ring-mist hover:bg-frost/60"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-frost text-ink">
              <BarChart3 className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink-deep">All families</span>
              <span className="block text-[0.9375rem] text-graphite">Totals across every family using Little Lines (admin only)</span>
            </span>
            <ChevronRight className="size-5 text-graphite" />
          </Link>
        ) : null}
      </section>

      <section className="mt-12" aria-labelledby="books-h">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="books-h" className="font-display text-heading font-bold text-ink-deep">
              Your family’s books
            </h2>
            <ButtonLink to="/grown-ups/import" variant="secondary">
              <FileUp className="size-5" /> Add a book from a PDF
            </ButtonLink>
          </div>
          <ul className="mt-4 divide-y-2 divide-frost overflow-hidden rounded-3xl bg-paper ring-2 ring-inset ring-mist">
            {books.map((b) => (
              <li key={b.id} className="flex items-center gap-4 px-5 py-3">
                <img src={b.coverThumb} alt="" className="w-10 rounded-[2px_4px_4px_2px] shadow-book" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-deep">{b.title}</p>
                  <p className="text-[0.9375rem] text-graphite">
                    {b.pages.filter((p) => p.kind === 'line-art').length} pages to color,{' '}
                    {b.origin === 'bundled' ? 'comes with the app' : 'added from a PDF'}
                  </p>
                </div>
                {b.origin === 'imported' ? (
                  <Button variant="danger" onClick={() => setRemoving(b)} aria-label={`Remove ${b.title}`}>
                    <Trash2 className="size-4" /> <span className="hidden sm:inline">Remove</span>
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

      <section className="mt-12" aria-labelledby="account-h">
        <h2 id="account-h" className="font-display text-heading font-bold text-ink-deep">
          Account
        </h2>
        <p className="mt-2 text-graphite">
          {account.signInMethods?.includes('google') && account.signInMethods.includes('password')
            ? 'You sign in with Google or your password.'
            : account.signInMethods?.includes('google')
              ? 'You sign in with Google.'
              : 'You sign in with your email and password.'}
        </p>
        <SyncStatus />
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setPinStep('current')}>
            <KeyRound className="size-5" /> Change parent PIN
          </Button>
          <Button
            variant="secondary"
            onClick={async () => {
              await logOut()
              navigate('/welcome', { replace: true })
            }}
          >
            <LogOut className="size-5" /> Log out
          </Button>
        </div>
      </section>

      {removing ? (
        <Dialog label="Remove book" onClose={() => setRemoving(null)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Remove {removing.title}?</h2>
          <p className="mt-2 text-graphite">
            It leaves your family’s library on every device, and any coloring of its pages is deleted too. This
            can’t be undone.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              variant="danger"
              onClick={async () => {
                const title = removing.title
                await deleteImportedBook(removing.id)
                await reloadLibrary()
                setRemoving(null)
                setNotice(`${title} was removed.`)
              }}
            >
              <Trash2 className="size-5" /> Remove book
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
          </div>
        </Dialog>
      ) : null}

      {pinStep ? (
        <Dialog label="Change parent PIN" onClose={() => setPinStep(null)}>
          {pinStep === 'current' ? (
            <PinPad
              key="current"
              title="Enter your current PIN"
              onSubmit={async (pin) => {
                if (!(await verifyParentPin(account.id, pin))) return 'wrong'
                setCurrentPin(pin)
                setPinStep('next')
                return 'ok'
              }}
            />
          ) : (
            <PinPad
              key="next"
              mode="create"
              title="Choose a new PIN"
              onSubmit={async (pin) => {
                await changeParentPin(account.id, currentPin, pin)
                setPinStep(null)
                setCurrentPin('')
                setNotice('Parent PIN changed.')
              }}
            />
          )}
        </Dialog>
      ) : null}
    </div>
  )
}

/** "Saved to your account just now", or why it isn't yet. */
function SyncStatus() {
  const { status, lastSynced, pending } = useSync()
  const text =
    status === 'offline'
      ? `You’re offline. ${pending ? `${pending} change${pending === 1 ? '' : 's'} will save` : 'Changes will save'} to your account when you’re back online.`
      : status === 'error'
        ? 'Couldn’t reach your account just now. Changes are kept on this device and will try again.'
        : status === 'syncing'
          ? 'Saving to your account…'
          : lastSynced
            ? `Saved to your account at ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(lastSynced)}.`
            : 'Your family’s coloring saves to your account automatically.'
  return (
    <p role="status" className="mt-1 text-[0.9375rem] text-graphite">
      {text}
    </p>
  )
}
