import { KeyRound, Lock, LogOut, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { Chip, ClayButton, ClayLink, ClayToggle, PaperCard } from '../components/cozy'
import { GrownupsFrame } from '../components/cozy/GrownupsFrame'
import { formatDuration } from '../data/analytics'
import type { Profile } from '../data/types'
import { useProfileInsights } from '../state/hooks'
import { changeParentPin, MAX_PROFILES, verifyParentPin } from '../data/accounts'
import { api, type EmailPrefs, type FamilyPlan } from '../data/api'
import { db } from '../data/db'
import { currentPlan, daysLeft } from '../data/plans'
import { useProfiles } from '../state/hooks'
import { useBooks } from '../state/library-store'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'
import { useSync } from '../sync/sync'
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
    <GrownupsFrame
      back={{ label: profileId ? 'Back to coloring' : 'Back to profiles', onClick: done }}
      title="Grown-ups"
      subtitle={
        <>
          Profiles, progress and settings for your family.{' '}
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            <Lock className="size-4" aria-hidden /> Locks again when you leave.
          </span>
        </>
      }
    >
      {/* Always present, so the message is announced when it appears. */}
      <p role="status" className={notice ? 'll-paper mx-auto mb-6 max-w-xl px-5 py-3 text-center font-bold text-[#1e5836]' : 'sr-only'}>
        {notice}
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <PaperCard className="px-6 pt-7 pb-8 sm:px-8">
          <section aria-labelledby="kids-h">
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="kids-h" className="ll-gh">
                Your children
              </h2>
              <span className="font-bold text-graphite">
                {profiles.length} of {MAX_PROFILES}
              </span>
            </div>
            <ul className="mt-2">
              {profiles.map((p) => (
                <ChildRow key={p.id} profile={p} />
              ))}
              {profiles.length === 0 ? <li className="py-5 font-bold text-graphite">No profiles yet. Add one for each child.</li> : null}
            </ul>
            {profiles.length < MAX_PROFILES ? (
              <ClayLink to="/profiles/new" state={{ from: '/grown-ups' }} tone="honey" size="sm" className="mt-5">
                <Plus className="size-5" strokeWidth={3} aria-hidden /> Add a profile
              </ClayLink>
            ) : null}
          </section>

          <section aria-labelledby="books-h" className="mt-9">
            <h2 id="books-h" className="ll-gh text-[1.5rem]">
              Your family’s books
            </h2>
            <p className="mt-2 font-bold text-graphite">New books are added to every family’s library by the Little Lines team.</p>
            <ul className="mt-4 flex flex-col gap-3">
              {books.map((b) => (
                <li key={b.id} className="flex items-center gap-4">
                  <img src={b.coverThumb} alt="" className="w-11 rounded-[2px_4px_4px_2px] shadow-book" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-[1.125rem] font-semibold text-ink-deep">{b.title}</p>
                    <p className="text-[0.9375rem] font-semibold text-graphite">
                      {b.pages.filter((p) => p.kind === 'line-art').length} pages to color,{' '}
                      {b.origin === 'bundled' ? 'comes with the app' : b.origin === 'catalog' ? 'from the Little Lines library' : 'added from a PDF'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </PaperCard>

        <PaperCard className="px-6 pt-7 pb-8 sm:px-8">
          <PlanSection plan={account.plan} />
          <EmailSection accountId={account.id} email={account.email} prefs={account.emailPrefs} />
          <ScreenSection />
          <section className="mt-8" aria-labelledby="account-h">
            <h2 id="account-h" className="ll-gh">
              Account
            </h2>
            <p className="mt-2 font-bold text-ink-deep">Signed in as {account.name} ({account.email}).</p>
            <p className="mt-1 font-semibold text-graphite">
              {account.signInMethods?.includes('google') && account.signInMethods.includes('password')
                ? 'You sign in with Google or your password.'
                : account.signInMethods?.includes('google')
                  ? 'You sign in with Google.'
                  : 'You sign in with your email and password.'}
            </p>
            <SyncStatus />
            <div className="mt-4 flex flex-wrap gap-3">
              <ClayButton tone="cream" size="sm" onClick={() => setPinStep('current')}>
                <KeyRound className="size-5" aria-hidden /> Change parent PIN
              </ClayButton>
              <ClayButton
                tone="cream"
                size="sm"
                className="!text-rust"
                onClick={async () => {
                  await logOut()
                  navigate('/welcome', { replace: true })
                }}
              >
                <LogOut className="size-5" aria-hidden /> Sign out
              </ClayButton>
            </div>
          </section>
        </PaperCard>
      </div>

      {pinStep ? (
        <Dialog label="Change parent PIN" onClose={() => setPinStep(null)}>
          <p className="text-center text-[0.9375rem] font-bold tracking-wide text-graphite uppercase">Change parent PIN</p>
          {pinStep === 'current' ? (
            <PinPad
              key="current"
              title="Enter your current PIN"
              accent="var(--ll-navy)"
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
              accent="var(--ll-navy)"
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
    </GrownupsFrame>
  )
}

/** One child: who, when they last colored, this week, and links to their report and profile. */
function ChildRow({ profile: p }: { profile: Profile }) {
  const insights = useProfileInsights(p.id)
  const s = insights?.stats
  const week = s
    ? `${formatDuration(s.weekMs)} this week · ${s.pagesFinished === 1 ? '1 page' : `${s.pagesFinished} pages`} finished${s.streak > 1 ? ` · ${s.streak}-day streak` : ''}`
    : 'Loading…'
  return (
    <li className="flex items-center gap-4 border-b-2 border-dashed border-mist py-4 last:border-b-0">
      <Avatar avatar={p.avatar} color={p.color} size="md" className="!size-16" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-display text-[1.5rem] leading-none font-semibold text-ink-deep">
          {p.name}
          {p.pinHash ? <Lock className="size-4 shrink-0 text-graphite" aria-label="Has a PIN" /> : null}
        </p>
        <p className="mt-1.5 text-[0.9375rem] font-semibold text-graphite">Last opened: {formatDate(p.lastActiveAt)}</p>
        <p className="text-[0.9375rem] font-bold text-ink-deep">{week}</p>
      </div>
      <div className="flex shrink-0 flex-col gap-2">
        <ClayLink to={`/grown-ups/children/${p.id}`} tone="navy" size="sm" aria-label={`${p.name}’s insights`} className="!min-h-11 !px-4 !text-[1rem]">
          Insights
        </ClayLink>
        <ClayLink to={`/profiles/${p.id}/edit`} state={{ from: '/grown-ups' }} tone="cream" size="sm" aria-label={`Edit ${p.name}’s profile`} className="!min-h-11 !px-4 !text-[1rem]">
          <Pencil className="size-4" aria-hidden /> Edit
        </ClayLink>
      </div>
    </li>
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
    <p role="status" className="mt-1 text-[0.9375rem] font-semibold text-graphite">
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
    <section aria-labelledby="plan-h">
      <h2 id="plan-h" className="ll-gh">
        Plan
      </h2>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Chip tone={current === 'free' ? 'sky' : 'gold'}>{current === 'trial' ? 'Premium trial' : name}</Chip>
        {current === 'trial' && plan?.endsAt ? (
          <span className="font-bold text-ink-deep">
            {daysLeft(plan.endsAt, now)} {daysLeft(plan.endsAt, now) === 1 ? 'day' : 'days'} left
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 font-semibold text-ink-deep">{detail}</p>
      <p className="mt-1.5 text-[0.9375rem] font-semibold text-graphite">Plans are set by the Little Lines team. Contact us to change yours.</p>
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
    <section className="mt-8" aria-labelledby="emails-h">
      <h2 id="emails-h" className="ll-gh">
        Emails
      </h2>
      <p className="mt-1.5 text-[0.9375rem] font-semibold text-graphite">Sent to {email}.</p>
      <ul className="mt-2">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p id={`email-${r.key}`} className="font-display text-[1.25rem] leading-tight font-semibold text-ink-deep">
                {r.title}
              </p>
              <p className="text-[0.9375rem] font-semibold text-graphite">{r.detail}</p>
            </div>
            <span className={saving !== null ? 'pointer-events-none opacity-60' : ''}>
              <ClayToggle checked={value[r.key]} onChange={() => toggle(r.key)} labelledBy={`email-${r.key}`} className="ll-toggle-mini" tone={{ on: 'var(--ll-pine)', onDk: 'var(--ll-pine-dk)' }} />
            </span>
          </li>
        ))}
      </ul>
      {error ? (
        <p role="alert" className="mt-2 text-[0.9375rem] font-bold text-error">
          {error}
        </p>
      ) : null}
      <p className="mt-2 text-[0.9375rem] font-semibold text-graphite">Account emails, like password resets, are always sent.</p>
    </section>
  )
}

/** Things on screen the family can switch off: the falling snow on the snowy scenes. */
function ScreenSection() {
  const snow = usePrefs((s) => s.snow)
  const setSnow = usePrefs((s) => s.setSnow)
  return (
    <section className="mt-8" aria-labelledby="screen-h">
      <h2 id="screen-h" className="ll-gh">
        On screen
      </h2>
      <div className="mt-2 flex items-center gap-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p id="screen-snow" className="font-display text-[1.25rem] leading-tight font-semibold text-ink-deep">
            Falling snow
          </p>
          <p id="screen-snow-hint" className="text-[0.9375rem] font-semibold text-graphite">
            Snowflakes drifting over the village, the reader and the sticker album.
          </p>
        </div>
        <ClayToggle
          checked={snow}
          onChange={setSnow}
          labelledBy="screen-snow"
          describedBy="screen-snow-hint"
          className="ll-toggle-mini"
          tone={{ on: 'var(--ll-pine)', onDk: 'var(--ll-pine-dk)' }}
        />
      </div>
    </section>
  )
}
