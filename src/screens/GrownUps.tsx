import { ArrowLeft, KeyRound, Lock, LogOut, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { Button, ButtonLink } from '../components/ui'
import { changeParentPin, MAX_PROFILES, verifyParentPin } from '../data/accounts'
import { api, type EmailPrefs, type FamilyPlan } from '../data/api'
import { db } from '../data/db'
import { currentPlan, daysLeft } from '../data/plans'
import { useProfiles } from '../state/hooks'
import { useBooks } from '../state/library-store'
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
      </section>

      <PlanSection plan={account.plan} />

      <EmailSection accountId={account.id} email={account.email} prefs={account.emailPrefs} />

      <section className="mt-12" aria-labelledby="books-h">
          <h2 id="books-h" className="font-display text-heading font-bold text-ink-deep">
            Your family’s books
          </h2>
          <p className="mt-2 max-w-prose text-graphite">New books are added to every family’s library by the Little Lines team.</p>
          <ul className="mt-4 divide-y-2 divide-frost overflow-hidden rounded-3xl bg-paper ring-2 ring-inset ring-mist">
            {books.map((b) => (
              <li key={b.id} className="flex items-center gap-4 px-5 py-3">
                <img src={b.coverThumb} alt="" className="w-10 rounded-[2px_4px_4px_2px] shadow-book" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-deep">{b.title}</p>
                  <p className="text-[0.9375rem] text-graphite">
                    {b.pages.filter((p) => p.kind === 'line-art').length} pages to color,{' '}
                    {b.origin === 'bundled' ? 'comes with the app' : b.origin === 'catalog' ? 'from the Little Lines library' : 'added from a PDF'}
                  </p>
                </div>
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

const longDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/** The family's plan, set by the Little Lines team: what it unlocks and until when. */
function PlanSection({ plan }: { plan: FamilyPlan | null | undefined }) {
  const now = Date.now()
  const current = currentPlan(plan, now)
  const ended = plan && plan.plan !== 'free' && current === 'free' && plan.endsAt ? plan.endsAt : null
  let name = 'Free'
  let detail = 'Premium books are locked. Every other book is yours to color.'
  if (current === 'trial' && plan?.endsAt) {
    name = 'Trial'
    const days = daysLeft(plan.endsAt, now)
    detail = `Every book is unlocked until ${longDate.format(plan.endsAt)} (${days} ${days === 1 ? 'day' : 'days'} left). After that, Premium books are locked.`
  } else if (current === 'premium') {
    name = 'Premium'
    detail = plan?.endsAt ? `Every book is unlocked until ${longDate.format(plan.endsAt)}.` : 'Every book is unlocked.'
  } else if (ended) {
    detail = `Your ${plan!.plan === 'trial' ? 'trial' : 'Premium plan'} ended on ${longDate.format(ended)}, so Premium books are locked.`
  }
  return (
    <section className="mt-12" aria-labelledby="plan-h">
      <h2 id="plan-h" className="font-display text-heading font-bold text-ink-deep">
        Plan
      </h2>
      <div className="mt-4 rounded-3xl bg-paper px-5 py-4 ring-2 ring-inset ring-mist">
        <p className="font-display text-[1.25rem] font-bold text-ink-deep">{name}</p>
        <p className="mt-1 max-w-prose text-graphite">{detail}</p>
      </div>
      <p className="mt-3 max-w-prose text-[0.9375rem] text-graphite">Plans are set by the Little Lines team. Contact us to change yours.</p>
    </section>
  )
}

/** Which optional emails the family gets. Changing them needs the internet; the welcome and password emails always arrive. */
function EmailSection({ accountId, email, prefs }: { accountId: string; email: string; prefs: EmailPrefs | undefined }) {
  const [value, setValue] = useState<EmailPrefs>(prefs ?? { weekly: true, news: true })
  const [saving, setSaving] = useState<keyof EmailPrefs | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(key: keyof EmailPrefs) {
    const next = { ...value, [key]: !value[key] }
    setSaving(key)
    setError(null)
    try {
      const saved = await api.setEmailPrefs({ [key]: next[key] })
      setValue(saved)
      // Keep this device's copy in step, so the switch shows the same thing next time, even offline.
      await db.accounts.update(accountId, { emailPrefs: saved })
      useSession.setState((s) => (s.account ? { account: { ...s.account, emailPrefs: saved } } : {}))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t save. Try again.')
    } finally {
      setSaving(null)
    }
  }

  const rows: Array<{ key: keyof EmailPrefs; title: string; detail: string }> = [
    { key: 'weekly', title: 'Weekly progress', detail: 'On Mondays: what each child colored last week.' },
    { key: 'news', title: 'New books', detail: 'When a new coloring book arrives in the library.' },
  ]
  return (
    <section className="mt-12" aria-labelledby="emails-h">
      <h2 id="emails-h" className="font-display text-heading font-bold text-ink-deep">
        Emails
      </h2>
      <p className="mt-2 text-graphite">Sent to {email}.</p>
      <ul className="mt-4 divide-y-2 divide-frost overflow-hidden rounded-3xl bg-paper ring-2 ring-inset ring-mist">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p id={`email-${r.key}`} className="font-semibold text-ink-deep">
                {r.title}
              </p>
              <p className="text-[0.9375rem] text-graphite">{r.detail}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={value[r.key]}
              aria-labelledby={`email-${r.key}`}
              disabled={saving !== null}
              onClick={() => toggle(r.key)}
              className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${value[r.key] ? 'bg-meadow-ink' : 'bg-mist'}`}
            >
              <span
                aria-hidden
                className={`absolute top-1 left-1 size-6 rounded-full bg-white shadow transition-transform ${value[r.key] ? 'translate-x-6' : ''}`}
              />
            </button>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-3 text-[0.9375rem] text-error">
          {error}
        </p>
      ) : null}
      <p className="mt-3 text-[0.9375rem] text-graphite">Account emails, like password resets, are always sent.</p>
    </section>
  )
}
