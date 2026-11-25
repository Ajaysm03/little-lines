import { ChevronLeft, ChevronRight, Download, Paintbrush, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { PagePreview } from '../components/BookCard'
import { ClayButton, ClayLink, Magnet, PaperCard, StatusSticker } from '../components/cozy'
import { pageLabel, pageState } from '../components/cozy/PageCards'
import { rovingKeys } from '../components/cozy/roving'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { TAB_BAR_SPACE, TabBar } from '../components/cozy/TabBar'
import { Spinner, cn } from '../components/ui'
import type { Book, BookPage } from '../content/books'
import type { StickerState } from '../data/achievements'
import type { Artwork } from '../data/types'
import { downloadPicture } from '../lib/export'
import { useModal } from '../lib/useModal'
import { useTitle } from '../lib/useTitle'
import { useArtworkThumbs, useProfileInsights } from '../state/hooks'
import { useBooks } from '../state/library-store'

type Filter = 'all' | 'done' | 'progress'
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'done', label: 'Finished' },
  { id: 'progress', label: 'Still coloring' },
]

interface Piece {
  art: Artwork
  book: Book
  page: BookPage
}

interface FridgeData {
  pieces: Piece[]
  shown: Piece[]
  filter: Filter
  setFilter: (f: Filter) => void
  thumbs: Map<string, string>
  stickers: StickerState[]
  open: (p: Piece) => void
}

const MAGNETS = ['var(--ll-cran)', 'var(--ll-pine)', 'var(--ll-sky)', 'var(--ll-honey)', '#8559d9']
/** Three spots for pictures on the fridge door; the fourth holds the stickers. */
const SPOTS = [
  { x: 306, y: 196, tilt: -3 },
  { x: 612, y: 206, tilt: 3 },
  { x: 330, y: 520, tilt: -1 },
]
const PER_DOOR = SPOTS.length

/** My art: pictures held on the fridge door with magnets, with the sticker collection stuck beside them. */
export function GalleryScreen() {
  useTitle('My art')
  const insights = useProfileInsights()
  const thumbs = useArtworkThumbs(insights?.artworks)
  const books = useBooks()
  const [filter, setFilter] = useState<Filter>('all')
  const [viewing, setViewing] = useState<Piece | null>(null)

  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = []
    for (const art of insights?.artworks ?? []) {
      if (art.progress <= 0 && !art.completedAt) continue
      const book = books.find((b) => b.id === art.bookId)
      const page = book?.pages.find((p) => p.id === art.pageId)
      if (book && page) out.push({ art, book, page })
    }
    return out.sort((a, b) => b.art.updatedAt - a.art.updatedAt)
  }, [insights?.artworks, books])

  if (!insights) {
    return (
      <main role="status" className="grid min-h-dvh place-items-center text-graphite">
        <span className="flex items-center gap-3 font-bold">
          <Spinner className="size-6" /> Opening your fridge…
        </span>
      </main>
    )
  }

  const shown = pieces.filter((p) => (filter === 'all' ? true : filter === 'done' ? Boolean(p.art.completedAt) : !p.art.completedAt))
  const data: FridgeData = { pieces, shown, filter, setFilter, thumbs, stickers: insights.stickers, open: setViewing }

  return (
    <>
      <Scene scene="myart" fit="contain" main className="h-dvh" pins={<FridgePins {...data} />}>
        <FridgeStacked {...data} />
      </Scene>
      {viewing ? <PictureViewer piece={viewing} colorUrl={thumbs.get(`${viewing.book.id}:${viewing.page.id}`)} onClose={() => setViewing(null)} /> : null}
    </>
  )
}

function Picture({ piece, index, colorUrl, onOpen, className, style }: { piece: Piece; index: number; colorUrl?: string; onOpen: () => void; className?: string; style?: CSSProperties }) {
  const state = pageState(piece.art)
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${pageLabel(piece.page.title, state)}, open picture`}
      className={cn('ll-fridge-art', className)}
      style={style}
    >
      <PagePreview page={piece.page} colorUrl={colorUrl} className="rounded-[2px] [&>img]:object-top" />
      <Magnet color={MAGNETS[index % MAGNETS.length]} className="absolute -top-4 left-1/2 -translate-x-1/2" />
      <StatusSticker status={state.status === 'done' ? 'done' : 'progress'} size={54} className="!absolute -right-3.5 -bottom-3.5">
        {state.sticker}
      </StatusSticker>
    </button>
  )
}

function EmptySpot({ linked, className, style }: { linked: boolean; className?: string; style?: CSSProperties }) {
  const inner = (
    <>
      <p className="px-6 font-display text-[24px] leading-[1.2] font-semibold text-[#5a4434]">
        {linked ? 'Color a page and it hangs here' : 'Finish a page and it hangs here'}
      </p>
      <Magnet color="#8559d9" className="absolute -top-[18px] left-1/2 -translate-x-1/2" />
    </>
  )
  const cls = cn('ll-fridge-empty', className)
  return linked ? (
    <Link to="/library" className={cls} style={style}>
      {inner}
    </Link>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  )
}

function StickerSpot({ stickers, className }: { stickers: StickerState[]; className?: string }) {
  const earned = stickers.filter((s) => s.earned)
  const show = (earned.length ? earned.slice(-2) : stickers.slice(0, 2)).reverse()
  return (
    <Link to="/stickers" aria-label={`${earned.length} of ${stickers.length} stickers collected. Open the sticker album`} className={cn('group relative block text-ink-deep', className)}>
      {show.map((s, i) => (
        <span
          key={s.id}
          aria-hidden
          className={cn('ll-sticker-disc absolute transition-transform group-hover:scale-105', !s.earned && 'll-sticker-disc-locked')}
          style={{ left: i ? 112 : 6, top: i ? 30 : 4, ['--d' as string]: '84px', ['--s' as string]: s.color, transform: `rotate(${i ? 7 : -8}deg)` }}
        >
          {s.emoji}
        </span>
      ))}
      <PaperCard flat tilt={-2} className="absolute top-[150px] left-[14px] px-[18px] py-3 font-display text-[22px] leading-[1.15] font-semibold whitespace-nowrap">
        {earned.length} of {stickers.length} stickers →
      </PaperCard>
    </Link>
  )
}

function FilterButtons({ d, big }: { d: FridgeData; big?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Show pictures" onKeyDown={rovingKeys} className={big ? 'flex flex-col gap-4' : 'flex flex-wrap gap-2.5'}>
      {FILTERS.map((f) => (
        <ClayButton
          key={f.id}
          role="radio"
          aria-checked={d.filter === f.id}
          tabIndex={d.filter === f.id ? 0 : -1}
          tone={d.filter === f.id ? 'pine' : 'cream'}
          size={big ? 'md' : 'sm'}
          onClick={() => d.setFilter(f.id)}
          className={big ? '!h-[54px] !min-h-[54px] w-[220px] !text-[23px]' : ''}
        >
          {f.label}
        </ClayButton>
      ))}
    </div>
  )
}

function FridgePins(d: FridgeData) {
  const { layout } = useSceneLayout()
  const [door, setDoor] = useState(0)
  // A new filter starts on the first door (without remounting, which would drop keyboard focus).
  useEffect(() => setDoor(0), [d.filter])
  const doors = Math.max(1, Math.ceil(d.shown.length / PER_DOOR))
  const page = Math.min(door, doors - 1)
  const onDoor = d.shown.slice(page * PER_DOOR, page * PER_DOOR + PER_DOOR)
  if (layout !== 'scene') return null
  return (
    <>
      <ScenePin x={400} y={52} w={452}>
        <PaperCard flat tilt={-1.5} className="px-[26px] py-[18px]">
          <h1 className="font-display text-[50px] leading-none font-semibold text-ink">My art</h1>
          <p className="mt-2 text-[18px] leading-[1.25] font-bold text-[#5a4434]">Every page you color gets hung up here.</p>
        </PaperCard>
      </ScenePin>
      <ScenePin x={392} y={40}>
        <Magnet color="var(--ll-honey)" />
      </ScenePin>
      <ScenePin x={826} y={32}>
        <Magnet color="var(--ll-sky)" />
      </ScenePin>

      <section aria-label="Pictures" className="pointer-events-none inset-0">
        {onDoor.map((p, i) => (
          <ScenePin key={p.art.id} x={SPOTS[i].x} y={SPOTS[i].y} w={208} h={287}>
            <Picture
              piece={p}
              index={page * PER_DOOR + i}
              colorUrl={d.thumbs.get(`${p.book.id}:${p.page.id}`)}
              onOpen={() => d.open(p)}
              className="size-full"
              style={{ ['--r' as string]: `${SPOTS[i].tilt}deg` }}
            />
          </ScenePin>
        ))}
        {onDoor.length < PER_DOOR ? (
          <ScenePin x={SPOTS[onDoor.length].x + 10} y={SPOTS[onDoor.length].y + 8} w={240} h={270}>
            <EmptySpot linked={d.pieces.length === 0} className="size-full -rotate-1" />
          </ScenePin>
        ) : null}
        {d.shown.length === 0 && d.pieces.length > 0 ? (
          <ScenePin x={600} y={250} w={250}>
            <PaperCard flat tilt={2} className="px-5 py-4 text-[21px] font-bold text-ink-deep">
              No pictures here yet.
            </PaperCard>
          </ScenePin>
        ) : null}
      </section>

      <ScenePin x={640} y={548} w={240} h={250}>
        <StickerSpot stickers={d.stickers} className="size-full" />
      </ScenePin>

      <ScenePin x={1112} y={612}>
        <FilterButtons d={d} big />
      </ScenePin>
      {doors > 1 ? (
        <ScenePin x={1112} y={826} w={220}>
          <div className="flex items-center justify-between">
            <ClayButton round diameter={60} tone="cream" aria-label="Newer pictures" disabled={page === 0} onClick={() => setDoor(page - 1)}>
              <ChevronLeft className="size-8" strokeWidth={3} aria-hidden />
            </ClayButton>
            <span className="ll-shelf-label" aria-live="polite">
              {page + 1} of {doors}
            </span>
            <ClayButton round diameter={60} tone="cream" aria-label="Older pictures" disabled={page >= doors - 1} onClick={() => setDoor(page + 1)}>
              <ChevronRight className="size-8" strokeWidth={3} aria-hidden />
            </ClayButton>
          </div>
        </ScenePin>
      ) : null}

      <TabBar variant="pins" />
    </>
  )
}

function FridgeStacked(d: FridgeData) {
  const { layout } = useSceneLayout()
  if (layout !== 'band') return null
  return (
    <div className={`-mt-8 flex flex-col items-center gap-7 px-4 ${TAB_BAR_SPACE}`}>
      <PaperCard flat tilt={-1} className="relative w-full max-w-xl px-6 py-5">
        <Magnet color="var(--ll-honey)" className="absolute -top-3 -left-2" />
        <Magnet color="var(--ll-sky)" className="absolute -top-3 -right-2" />
        <h1 className="font-display text-[2.25rem] leading-none font-semibold text-ink">My art</h1>
        <p className="mt-2 font-bold text-[#5a4434]">Every page you color gets hung up here.</p>
      </PaperCard>
      <div className="w-full max-w-xl">
        <FilterButtons d={d} />
      </div>
      <ul className="grid w-full max-w-xl grid-cols-2 gap-x-6 gap-y-9 pt-3">
        {d.shown.map((p, i) => (
          <li key={p.art.id}>
            <Picture
              piece={p}
              index={i}
              colorUrl={d.thumbs.get(`${p.book.id}:${p.page.id}`)}
              onOpen={() => d.open(p)}
              className="w-full"
              style={{ ['--r' as string]: `${SPOTS[i % SPOTS.length].tilt / 1.5}deg` }}
            />
          </li>
        ))}
        {d.shown.length < 2 ? (
          <li>
            <EmptySpot linked={d.pieces.length === 0} className="aspect-[208/287] w-full" />
          </li>
        ) : null}
      </ul>
      <StickerSpot stickers={d.stickers} className="h-[210px] w-[240px]" />
      <TabBar variant="fixed" />
    </div>
  )
}

function PictureViewer({ piece, colorUrl, onClose }: { piece: Piece; colorUrl?: string; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const { art, book, page } = piece
  const state = pageState(art)
  const pageNo = book.pages.indexOf(page)

  useModal(panel, onClose)

  async function save() {
    setSaving(true)
    try {
      await downloadPicture({
        colorLayer: art.colorLayer,
        lineArt: page.image,
        width: book.pageSize.width,
        height: book.pageSize.height,
        fileName: `${book.title} - ${page.title}`,
      })
      setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-[rgb(40_25_15/0.55)] p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="view-h"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="ll-paper relative flex max-h-full w-full max-w-[52rem] flex-col gap-6 overflow-y-auto p-5 outline-none sm:flex-row sm:gap-8 sm:p-8"
      >
        <div className="mx-auto w-full max-w-[min(30rem,58dvh)] shrink-0 rounded-md bg-[#fffdf8] p-2.5 shadow-[0_8px_18px_-8px_rgb(60_35_15/0.5)] sm:mx-0 sm:w-[55%]">
          <div className="relative aspect-[210/297] overflow-hidden rounded-[3px]">
            {colorUrl ? <img src={colorUrl} alt="" className="absolute inset-0 size-full" /> : null}
            <img src={page.image} alt={`${page.title}, ${state.note}`} className="absolute inset-0 size-full" />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4 sm:pt-14">
          <h2 id="view-h" className="font-display text-[2.25rem] leading-[1.05] font-semibold text-ink sm:text-[2.5rem]">
            {page.title}
          </h2>
          <p className="text-[1.25rem] leading-snug font-bold text-[#5a4434]">
            {state.status === 'done' ? 'Finished!' : `${state.pct}% colored.`} {book.title}, page {pageNo}.
          </p>
          <div className="mt-4 flex flex-col gap-4">
            <ClayLink to={`/color/${book.id}/${page.id}`} tone="cran">
              <Paintbrush className="size-6" aria-hidden /> {state.status === 'done' ? 'Color it again' : 'Keep coloring'}
            </ClayLink>
            <ClayButton tone="cream" busy={saving} onClick={save}>
              {saving ? null : <Download className="size-6" aria-hidden />} {saved ? 'Saved ✓' : 'Save picture'}
            </ClayButton>
          </div>
        </div>
        <ClayButton round diameter={56} tone="cream" aria-label="Close" onClick={onClose} className="!absolute top-3 right-3">
          <X className="size-7" strokeWidth={3} aria-hidden />
        </ClayButton>
      </div>
    </div>,
    document.body,
  )
}
