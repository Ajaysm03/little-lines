import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Lock, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { ClayButton, ClayField, ClayToggle, FormNote, PaperCard, Tape } from '../components/cozy'
import { Scene, useSceneLayout } from '../components/cozy/Scene'
import { cn } from '../components/ui'
import { accentStyle, bookAccent } from '../lib/accent'
import type { ReactNode } from 'react'
import { AVATARS, CRAYONS, avatarImage, crayonHex } from '../content/profile-options'
import { createProfile, deleteProfile, updateProfile, UserFacingError } from '../data/accounts'
import { db } from '../data/db'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { useTitle } from '../lib/useTitle'

export function ProfileEditor() {
  const { id } = useParams()
  const editing = Boolean(id)
  useTitle(editing ? 'Edit profile' : 'New profile')
  const existing = useLiveQuery(() => (id ? db.profiles.get(id) : undefined), [id])
  const account = useSession((s) => s.account)!
  const activeProfileId = useSession((s) => s.profileId)
  const leaveProfile = useSession((s) => s.leaveProfile)
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = (location.state as { from?: string } | null)?.from ?? '/profiles'

  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string>(AVATARS[0].id)
  const [color, setColor] = useState<string>(CRAYONS[4].id)
  /** undefined = keep current, null = remove, string = new PIN */
  const [pin, setPin] = useState<string | null | undefined>(undefined)
  const [choosingPin, setChoosingPin] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (existing) {
      setName(existing.name)
      setAvatar(existing.avatar)
      setColor(existing.color)
    }
  }, [existing])

  if (editing && existing === undefined) return <Splash />

  const hasPin = pin === undefined ? Boolean(existing?.pinHash) : pin !== null
  const displayName = name.trim() || 'New friend'

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNameError(null)
    if (!name.trim()) {
      setNameError('Enter a name for this profile.')
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      if (editing && id) await updateProfile(id, { name, avatar, color, pin })
      else await createProfile(account.id, { name, avatar, color, pin: pin ?? null })
      navigate(returnTo, { replace: true })
    } catch (err) {
      setError(err instanceof UserFacingError ? err.message : 'Something stopped saving. Try again.')
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!id) return
    if (activeProfileId === id) leaveProfile()
    await deleteProfile(id)
    navigate(returnTo, { replace: true })
  }

  const hex = crayonHex(color)

  return (
    <Scene scene="profiles" main className="h-dvh">
      <Frame>
          <div className="relative w-full max-w-[70rem]">
            <Tape variant="kraft" className="-top-3 left-16 -rotate-6" />
            <Tape variant="kraft" className="-top-3 right-16 rotate-[5deg]" />
            <PaperCard className="px-5 pt-6 pb-8 sm:px-10 sm:pt-8 sm:pb-10">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-display text-[1.125rem] font-semibold text-ink hover:bg-frost"
              >
                <ArrowLeft className="size-5" /> Back
              </button>

              <form onSubmit={onSave} className="mt-4 grid gap-10 md:grid-cols-[17rem_minmax(0,1fr)] lg:gap-14" noValidate>
                {/* Live preview of the name tag that will hang on the hook */}
                <div className="flex flex-col items-center md:sticky md:top-6 md:self-start">
                  <h1 className="text-center font-display text-[2rem] leading-[1.05] font-semibold text-ink-deep sm:text-[2.5rem]">
                    {editing ? `Edit ${existing?.name ?? 'profile'}` : 'New profile'}
                  </h1>
                  <div className="mt-6 flex flex-col items-center" aria-hidden>
                    <span className="h-7 w-1 rounded-sm bg-gradient-to-b from-[#7a4a2a] to-[#b98a5e]" />
                    <span className="relative size-44 -rotate-2 md:size-52">
                      <Avatar avatar={avatar} color={color} size="fill" />
                      {hasPin ? (
                        <span className="ll-who-lock">
                          <Lock className="size-6" strokeWidth={2.5} />
                        </span>
                      ) : null}
                    </span>
                    <span className="ll-paper ll-who-name max-w-[16rem] -rotate-1 text-[1.75rem]" style={{ color: 'var(--ll-ink)' }}>
                      {displayName}
                    </span>
                  </div>
                  <p className="mt-4 text-center text-[0.9375rem] font-semibold text-graphite">This tag hangs on the hook.</p>
                </div>

                <div className="flex min-w-0 flex-col gap-8">
                  <ClayField
                    ref={nameRef}
                    label="Name"
                    value={name}
                    maxLength={20}
                    autoComplete="off"
                    onChange={(e) => setName(e.target.value)}
                    error={nameError}
                  />

                  <fieldset>
                    <legend className="px-1 font-display text-[1.125rem] font-semibold text-ink-deep">Animal friend</legend>
                    <div className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                      {AVATARS.map((a) => {
                        const on = avatar === a.id
                        return (
                          <label key={a.id} className="cursor-pointer">
                            <input type="radio" name="avatar" value={a.id} checked={on} onChange={() => setAvatar(a.id)} className="peer sr-only" />
                            <span
                              className={cn(
                                'block aspect-square overflow-hidden rounded-full bg-[#f6ebd6] transition-[transform,box-shadow] peer-focus-visible:outline-4 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2a5689]',
                                on ? 'scale-105' : 'hover:-translate-y-0.5',
                              )}
                              style={{ boxShadow: on ? `0 0 0 4px #fffdf8, 0 0 0 8px ${hex}` : 'inset 0 0 0 3px #e2d3ba' }}
                              title={a.label}
                            >
                              <img src={avatarImage(a.id) ?? ''} alt="" className="size-full object-cover" draggable={false} />
                              <span className="sr-only">{a.label}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>

                  <fieldset>
                    <legend className="px-1 font-display text-[1.125rem] font-semibold text-ink-deep">Favorite crayon</legend>
                    <div className="mt-2 flex flex-wrap items-end gap-3 pt-3">
                      {CRAYONS.map((c) => {
                        const on = color === c.id
                        return (
                          <label key={c.id} className="cursor-pointer">
                            <input type="radio" name="color" value={c.id} checked={on} onChange={() => setColor(c.id)} className="peer sr-only" />
                            <span
                              className={cn(
                                'block rounded-xl transition-transform peer-focus-visible:outline-4 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2a5689]',
                                on ? '-translate-y-3' : 'hover:-translate-y-1',
                              )}
                              title={c.label}
                            >
                              <Crayon hex={c.hex} checked={on} />
                              <span className="sr-only">{c.label}</span>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </fieldset>

                  <div className="flex items-center justify-between gap-4 rounded-[28px] bg-cream px-5 py-4 ring-2 ring-mist/70">
                    <div>
                      <p id="profile-pin" className="font-display text-[1.125rem] font-semibold text-ink-deep">
                        Profile PIN
                      </p>
                      <p className="text-[0.9375rem] font-semibold text-graphite">
                        {hasPin ? 'A PIN is needed to open this profile.' : 'Anyone in the family can open this profile.'}
                      </p>
                    </div>
                    <ClayToggle
                      checked={hasPin}
                      onChange={(next) => (next ? setChoosingPin(true) : setPin(null))}
                      labelledBy="profile-pin"
                      icon={<Lock className="size-5" />}
                      tone={{ on: 'var(--ll-navy)', onDk: 'var(--ll-navy-dk)' }}
                    />
                  </div>

                  <FormNote>{error}</FormNote>

                  <div className="flex flex-wrap items-center justify-between gap-4">
                    {editing ? (
                      <ClayButton tone="cream" size="sm" className="!text-error" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="size-5" /> Delete profile
                      </ClayButton>
                    ) : (
                      <span />
                    )}
                    <ClayButton type="submit" size="lg" busy={busy} style={accentStyle({ accent: hex })}>
                      {editing ? 'Save changes' : 'Create profile'}
                    </ClayButton>
                  </div>
                </div>
              </form>
            </PaperCard>
          </div>
      </Frame>

      {choosingPin ? (
        <Dialog label="Choose a profile PIN" onClose={() => setChoosingPin(false)}>
          <PinPad
            mode="create"
            title={`Choose ${displayName}’s PIN`}
            subtitle="4 numbers to open this profile."
            accent={hex}
            onSubmit={(value) => {
              setPin(value)
              setChoosingPin(false)
            }}
          />
        </Dialog>
      ) : null}

      {confirmDelete ? (
        <Dialog label="Delete profile" onClose={() => setConfirmDelete(false)}>
          <h2 className="font-display text-heading font-semibold text-ink-deep">Delete {existing?.name}’s profile?</h2>
          <p className="mt-2 font-semibold text-graphite">Their colored pages and progress are deleted too. This can’t be undone.</p>
          <div className="mt-6 flex flex-col gap-4">
            <ClayButton tone="cran" onClick={onDelete}>
              Delete profile
            </ClayButton>
            <ClayButton tone="cream" onClick={() => setConfirmDelete(false)}>
              Keep profile
            </ClayButton>
          </div>
        </Dialog>
      ) : null}
    </Scene>
  )
}

/** A chunky clay crayon in one color, lifted when chosen. */
function Crayon({ hex, checked }: { hex: string; checked: boolean }) {
  return (
    <svg viewBox="0 0 44 104" className="block h-[5.5rem] w-auto drop-shadow-[0_4px_0_rgb(90_60_30_/_0.25)] sm:h-[6.5rem]" aria-hidden>
      <path d="M10 30 L22 4 L34 30 Z" fill={hex} />
      <path d="M17 15 L22 4 L27 15 Z" fill="#3e2a1e" opacity="0.25" />
      <rect x="6" y="28" width="32" height="72" rx="9" fill={hex} />
      <rect x="6" y="44" width="32" height="10" fill="#fff" opacity="0.35" />
      <rect x="6" y="80" width="32" height="10" fill="#fff" opacity="0.35" />
      <rect x="11" y="32" width="5" height="62" rx="2.5" fill="#fff" opacity="0.4" />
      {checked ? <path d="M14 66 l6 6 l11 -12" fill="none" stroke={bookAccent({ accent: hex }).onAcc} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : null}
    </svg>
  )
}

/** Over the scene with its own scroll; below the picture band on upright phones. */
function Frame({ children }: { children: ReactNode }) {
  const { layout } = useSceneLayout()
  if (layout === 'band') return <div className="-mt-8 flex justify-center px-4 pb-10">{children}</div>
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center px-4 py-8 sm:px-8">{children}</div>
    </div>
  )
}
