import { ArrowLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ClayLink, CrayonProgress, PaperCard } from '../components/cozy'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { Spinner, cn } from '../components/ui'
import type { StickerState } from '../data/achievements'
import { useTitle } from '../lib/useTitle'
import { useProfileInsights } from '../state/hooks'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'

interface AlbumData {
  stickers: StickerState[]
  chosen: StickerState
  choose: (id: string) => void
}

/** The sticker album on the desk: the chosen sticker large on the left page, all twelve on the right. */
export function StickersScreen() {
  useTitle('My stickers')
  const profileId = useSession((s) => s.profileId)
  const insights = useProfileInsights()
  const markSeen = usePrefs((s) => s.markStickersSeen)
  const [chosenId, setChosenId] = useState<string | null>(null)

  // Opening the album counts as having seen any new stickers.
  const earnedIds = insights?.stickers.filter((s) => s.earned).map((s) => s.id).join(',')
  useEffect(() => {
    if (profileId && earnedIds) markSeen(profileId, earnedIds.split(','))
  }, [profileId, earnedIds, markSeen])

  if (!insights) {
    return (
      <main role="status" className="grid min-h-dvh place-items-center text-graphite">
        <span className="flex items-center gap-3 font-bold">
          <Spinner className="size-6" /> Opening your sticker album…
        </span>
      </main>
    )
  }
  const stickers = insights.stickers
  // Start on the sticker the child is closest to earning, or the first one.
  const closest = [...stickers].filter((s) => !s.earned).sort((a, b) => b.progress - a.progress)[0]
  const chosen = stickers.find((s) => s.id === chosenId) ?? closest ?? stickers[0]
  const data: AlbumData = { stickers, chosen, choose: setChosenId }

  return (
    <Scene scene="reader" fit="contain" snow main className="h-dvh" pins={<AlbumPins {...data} />}>
      <AlbumStacked {...data} />
    </Scene>
  )
}

function Disc({ sticker, size, ring }: { sticker: StickerState; size: number; ring?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn('ll-sticker-disc ll-sticker-pop', !sticker.earned && 'll-sticker-disc-locked')}
      style={{
        ['--d' as string]: `${size}px`,
        ['--s' as string]: sticker.color,
        outline: ring ? '5px solid var(--ll-honey)' : undefined,
        outlineOffset: ring ? (sticker.earned ? 8 : 3) : undefined,
      }}
    >
      <span className={sticker.earned ? '' : 'opacity-35'}>{sticker.emoji}</span>
    </span>
  )
}

function Header({ stickers, big }: { stickers: StickerState[]; big?: boolean }) {
  const earned = stickers.filter((s) => s.earned).length
  return (
    <>
      <h1 className={big ? 'font-display text-[48px] leading-none font-semibold text-ink' : 'font-display text-[2.25rem] leading-none font-semibold text-ink'}>
        My stickers
      </h1>
      <p className={big ? 'mt-3 text-[22px] leading-none font-bold text-[#5a4434]' : 'mt-2 text-[1.125rem] font-bold text-[#5a4434]'}>
        {earned} of {stickers.length} collected
      </p>
      <CrayonProgress label="Stickers collected" value={earned} max={stickers.length} color="var(--ll-honey)" className={big ? 'mt-3 !w-[300px]' : 'mt-3 w-full max-w-xs'} />
    </>
  )
}

function Chosen({ sticker, big }: { sticker: StickerState; big?: boolean }) {
  const pct = Math.round(sticker.progress * 100)
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center rounded-2xl bg-[#f3e8d3] text-center shadow-[inset_0_2px_6px_rgb(90_60_30/0.15)]',
        big ? 'flex-1 px-[30px] py-[34px]' : 'px-5 py-6',
      )}
    >
      <Disc sticker={sticker} size={big ? 170 : 120} />
      <h2 className={big ? 'mt-6 font-display text-[36px] leading-[1.05] font-semibold text-ink-deep' : 'mt-5 font-display text-[1.75rem] leading-tight font-semibold text-ink-deep'}>
        {sticker.title}
      </h2>
      <p className={big ? 'mt-2.5 text-[22px] leading-[1.35] font-bold text-[#5a4434]' : 'mt-2 text-[1.125rem] font-bold text-[#5a4434]'}>{sticker.how}</p>
      {sticker.earned ? (
        <p className={big ? 'mt-[22px] font-display text-[26px] leading-none font-semibold text-[#1e5836]' : 'mt-4 font-display text-[1.375rem] font-semibold text-[#1e5836]'}>
          You got this one!
        </p>
      ) : (
        <div className={big ? 'mt-[22px] flex w-[300px] flex-col items-center gap-2' : 'mt-4 flex w-full max-w-xs flex-col items-center gap-2'}>
          <CrayonProgress label={`${sticker.title} progress`} value={pct} color={sticker.color} className="w-full" />
          <span className={big ? 'text-[20px] leading-none font-bold text-ink-deep' : 'font-bold text-ink-deep'}>
            {pct > 0 ? `${pct}% of the way there` : 'Not started yet'}
          </span>
        </div>
      )}
    </div>
  )
}

function StickerGrid({ d, big }: { d: AlbumData; big?: boolean }) {
  return (
    <ul className={big ? 'grid grid-cols-4 justify-items-center gap-x-2.5 gap-y-[26px]' : 'grid grid-cols-3 justify-items-center gap-x-3 gap-y-6 sm:grid-cols-4'}>
      {d.stickers.map((s) => {
        const on = s.id === d.chosen.id
        return (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={on}
              aria-label={`${s.title}, ${s.earned ? 'collected' : 'not yet'}`}
              onClick={() => d.choose(s.id)}
              className={cn('ll-sticker-pick group flex flex-col items-center gap-2.5 text-center font-display font-semibold text-ink-deep', big ? 'w-[118px] text-[17px] leading-[1.1]' : 'w-24 text-[0.9375rem] leading-tight')}
            >
              <Disc sticker={s} size={big ? 104 : 76} ring={on} />
              <span aria-hidden>{s.title}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function AlbumPins(d: AlbumData) {
  const { layout } = useSceneLayout()
  if (layout !== 'scene') return null
  return (
    <>
      <ScenePin x={40} y={30}>
        <ClayLink to="/home" tone="cream" size="sm" className="!h-16 !pr-7 !pl-[18px] !text-[28px]">
          <ArrowLeft className="size-8" strokeWidth={2.6} aria-hidden /> Home
        </ClayLink>
      </ScenePin>
      <ScenePin x={1100} y={30} w={226}>
        <div className="flex justify-end">
          <ClayLink to="/gallery" tone="pine" size="sm" className="!h-16 !text-[28px]">
            My art
          </ClayLink>
        </div>
      </ScenePin>

      {/* The album, open on the desk */}
      <ScenePin x={124} y={116} w={1118} h={780} className="ll-album">
        <div className="ll-album-leaves">
          <section aria-labelledby="stk-h" className="ll-album-leaf ll-album-leaf-l flex flex-col px-12 py-11">
            <div id="stk-h">
              <Header stickers={d.stickers} big />
            </div>
            <div className="mt-10 flex flex-1 flex-col">
              <Chosen sticker={d.chosen} big />
            </div>
          </section>
          <section aria-label="All stickers" className="ll-album-leaf ll-album-leaf-r px-[30px] pt-[50px] pb-[30px]">
            <StickerGrid d={d} big />
          </section>
        </div>
        <div aria-hidden className="ll-album-gutter" />
      </ScenePin>
    </>
  )
}

function AlbumStacked(d: AlbumData) {
  const { layout } = useSceneLayout()
  if (layout !== 'band') return null
  return (
    <div className="-mt-8 flex flex-col items-center gap-7 px-4 pb-12">
      <div className="flex w-full max-w-xl justify-between">
        <ClayLink to="/home" tone="cream" size="sm">
          <ArrowLeft className="size-5" strokeWidth={2.6} aria-hidden /> Home
        </ClayLink>
        <ClayLink to="/gallery" tone="pine" size="sm">
          My art
        </ClayLink>
      </div>
      <PaperCard className="w-full max-w-xl px-5 py-6">
        <Header stickers={d.stickers} />
        <div className="mt-6">
          <Chosen sticker={d.chosen} />
        </div>
      </PaperCard>
      <PaperCard className="w-full max-w-xl px-3 py-6">
        <StickerGrid d={d} />
      </PaperCard>
    </div>
  )
}
