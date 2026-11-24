import { ArrowLeft, BarChart3, ChevronRight, KeyRound, Lock, LogOut, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { Button, ButtonLink } from '../components/ui'
import { changeParentPin, MAX_PROFILES, verifyParentPin } from '../data/accounts'
import { useProfiles } from '../state/hooks'
import { useSession } from '../state/session-store'
import { ChildSummaryRow } from './InsightsScreens'

function formatDate(ms: number | null) {
  if (!ms) return 'Not yet'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(ms)
}

export function GrownUps() {
  const account = useSession((s) => s.account)!
  const profileId = useSession((s) => s.profileId)
  const logOut = useSession((s) => s.logOut)
  const lockParent = useSession((s) => s.lockParent)
  const profiles = useProfiles() ?? []
  const navigate = useNavigate()
  const [pinStep, setPinStep] = useState<null | 'current' | 'next'>(null)
  const [currentPin, setCurrentPin] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

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
              <span className="block font-semibold text-ink-deep">Device insights</span>
              <span className="block text-[0.9375rem] text-graphite">Totals across every family account on this device</span>
            </span>
            <ChevronRight className="size-5 text-graphite" />
          </Link>
        ) : null}
      </section>

      <section className="mt-12" aria-labelledby="account-h">
        <h2 id="account-h" className="font-display text-heading font-bold text-ink-deep">
          Account
        </h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setPinStep('current')}>
            <KeyRound className="size-5" /> Change parent PIN
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              logOut()
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
