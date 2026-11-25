import { Lock, Plus, Settings } from 'lucide-react'
import { useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { ClayLink, PaperCard, Tape } from '../components/cozy'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { Dialog } from '../components/Dialog'
import { PinPad } from '../components/PinPad'
import { crayonHex } from '../content/profile-options'
import { MAX_PROFILES, verifyProfilePin } from '../data/accounts'
import type { Profile } from '../data/types'
import { useTitle } from '../lib/useTitle'
import { useProfiles } from '../state/hooks'
import { useSession } from '../state/session-store'
import { Splash } from './guards'

/** The six coat hooks painted in the entryway scene, in picture pixels. */
const HOOKS_X = [269, 419, 570, 719, 870, 1021]
const HOOK_Y = 328
const TILTS = [-3, 2, -2, 3, -1, 2]
/** The bench the "Add someone" card stands on. */
const BENCH = { x: 900, y: 642, w: 230, h: 162 }

/** Which hooks to hang n tags on: every other hook for up to three, otherwise the middle run. */
function hooksFor(n: number): number[] {
  if (n <= 3) return [0, 2, 4].slice(0, n).map((i) => HOOKS_X[i + (n === 1 ? 2 : n === 2 ? 1 : 0)])
  const start = Math.floor((HOOKS_X.length - n) / 2)
  return HOOKS_X.slice(start, start + n)
}

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
    <>
      <Entryway profiles={profiles} onOpen={open} />
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
    </>
  )
}

function Entryway({ profiles, onOpen }: { profiles: Profile[]; onOpen: (p: Profile) => void }) {
  return (
    <Scene scene="profiles" main className="h-dvh" pins={<HookPins profiles={profiles} onOpen={onOpen} />}>
      <EntrywayUI profiles={profiles} onOpen={onOpen} />
    </Scene>
  )
}

/** Tags hang on the hooks only when the whole row of hooks and the bench are on screen. */
function useHooksFit() {
  const { layout, view, scale } = useSceneLayout()
  // The hooks scale with the window; when that would make the name tags small (or the page is zoomed in)
  // the tags go in a grid instead, at full size.
  return layout === 'scene' && scale >= 0.7 && view.x0 <= HOOKS_X[0] - 90 && view.x1 >= BENCH.x + BENCH.w + 10 && view.y1 >= BENCH.y + BENCH.h + 140
}

function HookPins({ profiles, onOpen }: { profiles: Profile[]; onOpen: (p: Profile) => void }) {
  const fits = useHooksFit()
  if (!fits) return null
  const xs = hooksFor(profiles.length)
  const big = profiles.length <= 3
  const w = big ? 240 : 150
  return (
    <>
      <nav aria-label="Profiles" className="pointer-events-none inset-0">
        {profiles.map((p, i) => (
          <ScenePin key={p.id} x={xs[i] - w / 2} y={HOOK_Y - 8} w={w}>
            <NameTag profile={p} tilt={TILTS[i]} face={big ? 184 : 124} nameSize={big ? 32 : 24} string={big ? 46 : 36} onOpen={onOpen} />
          </ScenePin>
        ))}
      </nav>
      {profiles.length < MAX_PROFILES ? (
        <ScenePin x={BENCH.x} y={BENCH.y} w={BENCH.w} h={BENCH.h}>
          <AddCard className="size-full rotate-2" />
        </ScenePin>
      ) : null}
    </>
  )
}

function NameTag({
  profile: p,
  tilt,
  face,
  nameSize,
  string,
  onOpen,
}: {
  profile: Profile
  tilt: number
  face: number
  nameSize: number
  string?: number
  onOpen: (p: Profile) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(p)}
      aria-label={p.pinHash ? `${p.name}, asks for a PIN` : p.name}
      className="ll-who"
      style={{ ['--r' as string]: `${tilt}deg`, ['--string' as string]: string ? `${string}px` : '0px' } as CSSProperties}
    >
      {string ? (
        <>
          <span className="ll-who-knot" aria-hidden />
          <span className="ll-who-string" aria-hidden />
        </>
      ) : null}
      <span className="ll-who-face" style={{ width: face, height: face }}>
        <Avatar avatar={p.avatar} color={p.color} size="fill" />
        {p.pinHash ? (
          <span className="ll-who-lock" aria-hidden>
            <Lock style={{ width: '45%', height: '45%' }} strokeWidth={2.5} />
          </span>
        ) : null}
      </span>
      <span className="ll-paper ll-who-name" style={{ fontSize: nameSize }}>
        {p.name}
      </span>
    </button>
  )
}

function AddCard({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <Link
      to="/profiles/new"
      className={`ll-paper flex flex-col items-center justify-center gap-2.5 border-4 border-dashed border-[#c9af88] p-3 text-center text-ink-deep no-underline transition-transform hover:-translate-y-1 ${className ?? ''}`}
      style={style}
    >
      <span className="ll-clay ll-tone-honey ll-clay-round pointer-events-none" style={{ ['--d' as string]: '64px' }} aria-hidden>
        <Plus className="size-8" strokeWidth={3} />
      </span>
      <span className="font-display text-[1.5rem] leading-[1.1] font-semibold">
        Add someone
        <br />
        to color
      </span>
    </Link>
  )
}

function EntrywayUI({ profiles, onOpen }: { profiles: Profile[]; onOpen: (p: Profile) => void }) {
  const { layout } = useSceneLayout()
  const fits = useHooksFit()
  const empty = profiles.length === 0

  const title = (
    <div className="relative">
      <Tape variant="kraft" className="-top-3 left-8 -rotate-6" />
      <Tape variant="kraft" className="-top-3 right-8 rotate-[5deg]" />
      <PaperCard className="px-8 py-5 text-center sm:px-12" tilt={-1}>
        <h1 className="font-display text-[2rem] leading-[1.05] font-semibold text-ink sm:text-[2.75rem] lg:text-[3.25rem]">
          {empty ? 'Add someone to color' : 'Who’s coloring today?'}
        </h1>
        {empty ? (
          <p className="mt-2 max-w-[34ch] text-[1.0625rem] font-semibold text-graphite">
            Each child gets a profile with their own pages, colors and progress.
          </p>
        ) : null}
      </PaperCard>
    </div>
  )

  const grownUps = (
    <ClayLink to="/grown-ups" tone="navy">
      <Settings className="size-6" /> Grown-ups
    </ClayLink>
  )

  if (fits) {
    return (
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-between pt-[max(1.25rem,4vh)] pb-[max(1.25rem,5vh)]">
        <div className="pointer-events-auto">{title}</div>
        <div className="pointer-events-auto">{grownUps}</div>
      </div>
    )
  }

  // Phones, and screens too narrow for the row of hooks: tags in a grid on the floor below.
  const list = (
    <div className="flex w-full max-w-xl flex-col items-center gap-8">
      {title}
      <nav aria-label="Profiles" className="w-full">
        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3">
          {profiles.map((p, i) => (
            <li key={p.id} className="flex justify-center">
              <NameTag profile={p} tilt={TILTS[i] / 2} face={112} nameSize={22} onOpen={onOpen} />
            </li>
          ))}
          {profiles.length < MAX_PROFILES ? (
            <li className="flex justify-center">
              <AddCard className="h-[10.5rem] w-full max-w-[11rem] rotate-1 [&_.font-display]:text-[1.25rem]" />
            </li>
          ) : null}
        </ul>
      </nav>
      {grownUps}
    </div>
  )
  if (layout === 'band') return <div className="-mt-8 flex justify-center px-4 pb-10">{list}</div>
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center px-6 py-10">{list}</div>
    </div>
  )
}
