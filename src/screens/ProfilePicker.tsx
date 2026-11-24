import { Lock, Plus, Settings } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { Wordmark } from '../components/Wordmark'
import { ButtonLink, cn } from '../components/ui'
import { crayonHex } from '../content/profile-options'
import { MAX_PROFILES, verifyProfilePin } from '../data/accounts'
import type { Profile } from '../data/types'
import { useProfiles } from '../state/hooks'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { useTitle } from '../lib/useTitle'

export function ProfilePicker() {
  const profiles = useProfiles()
  useTitle('Who’s coloring today?')
  const selectProfile = useSession((s) => s.selectProfile)
  const checkPin = useSession((s) => s.checkPin)
  const navigate = useNavigate()
  const [asking, setAsking] = useState<Profile | null>(null)

  if (profiles === undefined) return <Splash />

  async function open(p: Profile) {
    if (p.pinHash) return setAsking(p)
    await selectProfile(p.id)
    navigate('/home')
  }

  return (
    <div className="flex min-h-dvh flex-col px-4 pt-6 pb-10 sm:px-8">
      <header className="flex items-center justify-between">
        <Wordmark size="sm" />
        <Link
          to="/grown-ups"
          className="inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold text-ink hover:bg-frost"
        >
          <Settings className="size-5" /> Grown-ups
        </Link>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center py-12">
        {profiles.length === 0 ? (
          <div className="flex max-w-md flex-col items-center text-center">
            <h1 className="font-display text-title font-extrabold text-ink-deep">Add someone to color</h1>
            <p className="mt-3 text-graphite">
              Each child gets a profile with their own pages, colors and progress.
            </p>
            <ButtonLink to="/profiles/new" size="lg" className="mt-8">
              <Plus className="size-5" /> Add a profile
            </ButtonLink>
          </div>
        ) : (
          <>
            <h1 className="text-center font-display text-display font-extrabold text-ink-deep">
              Who’s coloring today?
            </h1>
            <ul className="mt-12 flex max-w-4xl flex-wrap justify-center gap-x-8 gap-y-10 sm:gap-x-12">
              {profiles.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => open(p)}
                    className="group flex w-32 flex-col items-center gap-3 rounded-3xl p-2 md:w-36"
                  >
                    <span className="relative transition-transform duration-150 group-hover:-translate-y-1 group-active:scale-95">
                      <Avatar avatar={p.avatar} color={p.color} size="lg" />
                      {p.pinHash ? (
                        <span className="absolute -right-1 -bottom-1 grid size-9 place-items-center rounded-full bg-paper text-graphite shadow-lift">
                          <Lock className="size-4" aria-label="Has a PIN" />
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="font-display text-[1.375rem] font-bold text-ink-deep underline decoration-[3px] decoration-transparent underline-offset-[6px] transition-colors group-hover:decoration-[var(--crayon)]"
                      style={{ ['--crayon' as string]: crayonHex(p.color) }}
                    >
                      {p.name}
                    </span>
                  </button>
                </li>
              ))}
              {profiles.length < MAX_PROFILES ? (
                <li>
                  <Link to="/profiles/new" className="group flex w-32 flex-col items-center gap-3 rounded-3xl p-2 md:w-36">
                    <span
                      className={cn(
                        'grid size-28 place-items-center rounded-full border-[3px] border-dashed border-mist text-graphite transition-colors md:size-32',
                        'group-hover:border-ink/40 group-hover:text-ink',
                      )}
                    >
                      <Plus className="size-10" />
                    </span>
                    <span className="font-display text-[1.375rem] font-bold text-graphite">Add</span>
                  </Link>
                </li>
              ) : null}
            </ul>
          </>
        )}
      </main>

      {asking ? (
        <Dialog label={`Enter ${asking.name}’s PIN`} onClose={() => setAsking(null)}>
          <PinPad
            title={`Hi ${asking.name}!`}
            subtitle="Enter your PIN."
            accent={crayonHex(asking.color)}
            onSubmit={async (pin) => {
              const result = await checkPin(`profile:${asking.id}`, () => verifyProfilePin(asking.id, pin))
              if (result === 'ok') {
                await selectProfile(asking.id)
                navigate('/home')
              }
              return result
            }}
          />
        </Dialog>
      ) : null}
    </div>
  )
}
