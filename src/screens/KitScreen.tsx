import { Flame, Lock, Plus } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '../components/Avatar'
import {
  Chip,
  ClayButton,
  ClayField,
  ClayLink,
  ClayToggle,
  CrayonProgress,
  Magnet,
  PaperCard,
  SignLabel,
  StatusSticker,
  Tape,
  type ClayTone,
} from '../components/cozy'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { PinPad } from '../components/PinPad'
import { AVATARS, CRAYONS } from '../content/profile-options'
import { SCENES, type SceneName } from '../content/scenes'
import { accentStyle, bookAccent } from '../lib/accent'
import { useTitle } from '../lib/useTitle'

/** Developer-only page (/dev/kit, dev server only) showing every cozy building block. */
export function KitScreen() {
  useTitle('Cozy kit')
  const [scene, setScene] = useState<SceneName>('home')
  const [on, setOn] = useState(true)
  const themes = [
    { name: 'Cozy Christmas', accent: '#C8283A' },
    { name: 'Light blue cover', accent: '#7FA7D9' },
    { name: 'Sunflower cover', accent: '#F2C230' },
  ]
  const tones: ClayTone[] = ['accent', 'honey', 'cran', 'pine', 'sky', 'navy', 'gold', 'cream', 'white']

  return (
    <div style={accentStyle({ accent: '#C8283A' })}>
      <Scene
        scene={scene}
        className="h-dvh"
        snow={scene === 'home'}
        pins={
          scene === 'home' ? (
            <>
              <ScenePin x={331} y={436} w={100} h={44}>
                <SignLabel to="/dev/kit" className="size-full">Library</SignLabel>
              </ScenePin>
              <ScenePin x={246} y={509} w={84} h={46}>
                <SignLabel to="/dev/kit" className="size-full">My art</SignLabel>
              </ScenePin>
              <ScenePin x={304} y={672} w={94} h={46}>
                <SignLabel to="/dev/kit" className="size-full">Stickers</SignLabel>
              </ScenePin>
            </>
          ) : null
        }
      >
        <SceneNote scene={scene} onScene={setScene} />
      </Scene>

      <main className="mx-auto max-w-6xl space-y-14 px-6 py-14">
        <section>
          <h1 className="font-display text-display font-semibold text-ink">Cozy kit</h1>
          <p className="mt-3 max-w-prose text-[1.25rem] font-semibold text-graphite">
            Paper holds what you read; clay is what you press. Fredoka for headings, Nunito for reading, Pacifico for book titles.
          </p>
          <p className="mt-4 font-book text-[3rem] leading-tight" style={{ color: 'var(--acc)' }}>
            Cozy Christmas
          </p>
        </section>

        <section>
          <h2 className="font-display text-title font-semibold text-ink">Clay buttons</h2>
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-7">
            {tones.map((t) => (
              <ClayButton key={t} tone={t}>
                {t === 'accent' ? 'Book accent' : t[0].toUpperCase() + t.slice(1)}
              </ClayButton>
            ))}
            <ClayButton size="sm" tone="cream">Small</ClayButton>
            <ClayButton size="lg">Large</ClayButton>
            <ClayButton round tone="cream" aria-label="Add">
              <Plus className="size-8" strokeWidth={3} />
            </ClayButton>
            <ClayButton busy>Saving</ClayButton>
            <ClayButton disabled>Disabled</ClayButton>
            <ClayLink to="/dev/kit" tone="pine">A link</ClayLink>
          </div>
        </section>

        <section>
          <h2 className="font-display text-title font-semibold text-ink">Book accents</h2>
          <p className="mt-2 text-graphite">Text on the button switches to cocoa, or the color deepens, so labels always pass 4.5:1.</p>
          <div className="mt-6 grid gap-8 sm:grid-cols-3">
            {themes.map((t) => {
              const a = bookAccent(t)
              return (
                <PaperCard key={t.name} className="p-6" style={accentStyle(t)}>
                  <p className="font-display text-[1.25rem] font-semibold">{t.name}</p>
                  <p className="mt-1 text-[0.9375rem] text-graphite">
                    cover {t.accent} → button {a.acc}
                  </p>
                  <ClayButton className="mt-5 w-full">Open the book</ClayButton>
                </PaperCard>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="font-display text-title font-semibold text-ink">Paper, tape, chips, stickers</h2>
          <div className="mt-8 flex flex-wrap items-start gap-10">
            <div className="relative">
              <Tape variant="kraft" className="left-1/2 -top-4 -translate-x-1/2 -rotate-3" />
              <PaperCard className="w-80 p-7" tilt={-1.5}>
                <h3 className="font-display text-heading font-semibold">Paper card</h3>
                <p className="mt-2 font-semibold text-graphite">Held on with tape, tilted a little when it sits in a scene.</p>
              </PaperCard>
            </div>
            <div className="flex flex-col gap-6">
              <div className="relative flex h-12 gap-6">
                {(['peach', 'mint', 'kraft', 'cran', 'rainbow'] as const).map((v) => (
                  <Tape key={v} variant={v} className="!static !w-28" />
                ))}
              </div>
              <div className="flex flex-wrap gap-3">
                <Chip tone="gold">Ages 3–8</Chip>
                <Chip tone="pine">4 pages</Chip>
                <Chip tone="sky">Winter</Chip>
                <Chip tone="accent">Book accent</Chip>
              </div>
              <div className="flex items-center gap-6">
                <StatusSticker status="done">Done!</StatusSticker>
                <StatusSticker status="progress">45%</StatusSticker>
                <StatusSticker status="new">New</StatusSticker>
                <StatusSticker status="new" size={44}>
                  New
                </StatusSticker>
                <Magnet />
                <Magnet color="var(--ll-sky)" />
                <Magnet color="var(--ll-honey)" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-10 md:grid-cols-2">
          <div className="space-y-6">
            <h2 className="font-display text-title font-semibold text-ink">Fields, toggles, progress</h2>
            <ClayField label="Email or username" hideLabel autoComplete="off" />
            <ClayField label="Your name" hint="Shown on your family’s profile tags." />
            <ClayField label="Password" type="password" error="That password is too short." />
            <div className="flex items-center gap-4">
              <span id="kit-lines" className="font-display text-[1.25rem] font-semibold">
                Stay in lines
              </span>
              <ClayToggle checked={on} onChange={setOn} labelledBy="kit-lines" />
              <ClayToggle checked={!on} onChange={(v) => setOn(!v)} label="Fireplace" icon={<Flame className="size-6" />} />
              <ClayToggle checked label="Has a PIN" icon={<Lock className="size-5" />} tone={{ on: 'var(--ll-navy)', onDk: 'var(--ll-navy-dk)' }} onChange={() => {}} />
            </div>
            <CrayonProgress label="Pages finished" value={1} max={4} valueText="1 of 4 pages" />
            <CrayonProgress label="Christmas Cookies" value={45} color="var(--ll-sky)" />
          </div>
          <PaperCard className="p-8">
            <PinPad title="Grown-ups only" subtitle="Enter your parent PIN to continue." onSubmit={() => 'wrong'} />
          </PaperCard>
        </section>

        <section>
          <h2 className="font-display text-title font-semibold text-ink">Clay animals</h2>
          <div className="mt-6 flex flex-wrap gap-6">
            {AVATARS.map((a, i) => (
              <figure key={a.id} className="flex flex-col items-center gap-2">
                <Avatar avatar={a.id} color={CRAYONS[i % CRAYONS.length].id} size="lg" />
                <figcaption className="font-display font-semibold">{a.label}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      </main>
    </div>
  )
}

function SceneNote({ scene, onScene }: { scene: SceneName; onScene: (s: SceneName) => void }) {
  const { layout, scale } = useSceneLayout()
  return (
    <div className={layout === 'band' ? 'p-4' : 'pointer-events-auto absolute left-6 top-6'}>
      <PaperCard className="w-80 max-w-full p-5">
        <h2 className="font-display text-heading font-semibold">Scenes</h2>
        <p className="mt-1 text-[0.9375rem] font-semibold text-graphite">
          {layout === 'band' ? 'Phone band layout' : `Full scene, picture scale ${scale.toFixed(2)}`}. Resize the window to see the
          signposts stay on their signs.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {SCENES.map((s) => (
            <ClayButton key={s} size="sm" tone={s === scene ? 'accent' : 'cream'} aria-pressed={s === scene} onClick={() => onScene(s)}>
              {s}
            </ClayButton>
          ))}
        </div>
      </PaperCard>
    </div>
  )
}
