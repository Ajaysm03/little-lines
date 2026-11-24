import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Check, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { Button, FormError, TextField, cn } from '../components/ui'
import { AVATARS, CRAYONS, crayonHex } from '../content/profile-options'
import { createProfile, deleteProfile, updateProfile, UserFacingError } from '../data/accounts'
import { db } from '../data/db'
import { useSession } from '../state/session-store'
import { Splash } from './guards'

export function ProfileEditor() {
  const { id } = useParams()
  const editing = Boolean(id)
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
    if (!name.trim()) return setNameError('Enter a name for this profile.')
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

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-6 pb-12 sm:px-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 font-semibold text-ink hover:bg-frost"
      >
        <ArrowLeft className="size-5" /> Back
      </button>

      <form onSubmit={onSave} className="mt-6 flex flex-col gap-10" noValidate>
        <header className="flex items-center gap-5">
          <Avatar avatar={avatar} color={color} size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-title font-extrabold text-ink-deep">
              {editing ? `Edit ${existing?.name ?? 'profile'}` : 'New profile'}
            </h1>
            <p className="mt-1 truncate font-display text-[1.25rem] font-semibold" style={{ color: crayonHex(color) }}>
              {displayName}
            </p>
          </div>
        </header>

        <TextField
          label="Name"
          value={name}
          maxLength={20}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />

        <fieldset>
          <legend className="font-semibold text-ink-deep">Animal friend</legend>
          <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {AVATARS.map((a) => (
              <label key={a.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="avatar"
                  value={a.id}
                  checked={avatar === a.id}
                  onChange={() => setAvatar(a.id)}
                  className="peer sr-only"
                />
                <span
                  className={cn(
                    'grid aspect-square place-items-center rounded-2xl bg-paper text-[2.25rem] ring-inset transition-shadow peer-focus-visible:outline-3 peer-focus-visible:outline-sky',
                    avatar === a.id ? 'ring-4' : 'ring-2 ring-mist hover:ring-ink/30',
                  )}
                  style={avatar === a.id ? { ['--tw-ring-color' as string]: crayonHex(color) } : undefined}
                  title={a.label}
                >
                  <span aria-hidden>{a.emoji}</span>
                  <span className="sr-only">{a.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="font-semibold text-ink-deep">Favorite crayon</legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {CRAYONS.map((c) => (
              <label key={c.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={c.id}
                  checked={color === c.id}
                  onChange={() => setColor(c.id)}
                  className="peer sr-only"
                />
                <span
                  className="grid size-14 place-items-center rounded-full text-white ring-offset-2 ring-offset-snow transition-shadow peer-focus-visible:outline-3 peer-focus-visible:outline-sky"
                  style={{
                    backgroundColor: c.hex,
                    boxShadow: color === c.id ? `0 0 0 3px var(--color-snow), 0 0 0 6px ${c.hex}` : undefined,
                  }}
                  title={c.label}
                >
                  {color === c.id ? <Check className="size-6" strokeWidth={3} aria-hidden /> : null}
                  <span className="sr-only">{c.label}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-4 rounded-3xl bg-paper px-5 py-4 ring-2 ring-inset ring-mist">
          <div>
            <p className="font-semibold text-ink-deep">Profile PIN</p>
            <p className="text-[0.9375rem] text-graphite">
              {hasPin ? 'A PIN is needed to open this profile.' : 'Anyone in the family can open this profile.'}
            </p>
          </div>
          {hasPin ? (
            <Button variant="secondary" onClick={() => setPin(null)}>
              Remove PIN
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => setChoosingPin(true)}>
              Add PIN
            </Button>
          )}
        </div>

        <FormError>{error}</FormError>

        <div className="flex flex-wrap items-center justify-between gap-4">
          {editing ? (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="size-5" /> Delete profile
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" size="lg" busy={busy}>
            {editing ? 'Save changes' : 'Create profile'}
          </Button>
        </div>
      </form>

      {choosingPin ? (
        <Dialog label="Choose a profile PIN" onClose={() => setChoosingPin(false)}>
          <PinPad
            mode="create"
            title={`Choose ${displayName}’s PIN`}
            subtitle="4 numbers to open this profile."
            accent={crayonHex(color)}
            onSubmit={(value) => {
              setPin(value)
              setChoosingPin(false)
            }}
          />
        </Dialog>
      ) : null}

      {confirmDelete ? (
        <Dialog label="Delete profile" onClose={() => setConfirmDelete(false)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Delete {existing?.name}’s profile?</h2>
          <p className="mt-2 text-graphite">
            Their colored pages and progress are deleted too. This can’t be undone.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button variant="danger" onClick={onDelete}>
              Delete profile
            </Button>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Keep profile
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}
