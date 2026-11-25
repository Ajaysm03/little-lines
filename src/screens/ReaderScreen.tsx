import { ArrowLeft, ChevronLeft, ChevronRight, Flame, Paintbrush, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { FlipBook, type FlipBookHandle, type FlipPage, type FlipView } from '../components/FlipBook'
import { ClayButton, ClayLink, ClayToggle, PaperCard, Tape } from '../components/cozy'
import { cn } from '../components/ui'
import { sceneBackground } from '../content/scenes'
import { accentStyle } from '../lib/accent'
import type { Book } from '../content/books'
import { isSnowyBook, Snowfall } from '../components/Snowfall'
import { logEvent } from '../data/events'
import { isBookLocked } from '../data/plans'
import { preloadSounds, startFireplace } from '../lib/sounds'
import { visiblePages } from '../lib/spread'
import { useArtworkThumbs, useProfileArtworks } from '../state/hooks'
import { useBook, useLibrary } from '../state/library-store'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'
import { useTitle } from '../lib/useTitle'

function positionLabel(book: Book, visible: number[]): string {
  const pages = visible.map((i) => book.pages[i])
  if (pages.length === 1 && pages[0].kind === 'front-cover') return 'Front cover'
  if (pages.length === 1 && pages[0].kind === 'back-cover') return 'Back cover'
  const total = book.pages.filter((p) => p.kind === 'line-art').length
  // The front cover is index 0, so an interior page's index is its page number.
  const nums = visible.filter((i) => book.pages[i].kind === 'line-art')
  if (nums.length === 0) return ''
  return nums.length === 1 ? `Page ${nums[0]} of ${total}` : `Pages ${nums[0]}–${nums[nums.length - 1]} of ${total}`
}

export function ReaderScreen() {
  const { bookId } = useParams()
  const book = useBook(bookId)
  const loaded = useLibrary((s) => s.loaded)
  const plan = useSession((s) => s.account?.plan)
  if (!book) return loaded ? <NotFound /> : <Splash />
  // A Premium book on the Free plan: its page explains the lock.
  if (isBookLocked(book, plan)) return <Navigate to={`/books/${book.id}`} replace />
  return <Reader key={book.id} book={book} />
}

function Reader({ book }: { book: Book }) {
  useTitle(book.title)
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const accountId = useSession((s) => s.account?.id)
  const profileId = useSession((s) => s.profileId)
  const sound = usePrefs((s) => s.sound)
  const setSound = usePrefs((s) => s.setSound)
  const fireplace = usePrefs((s) => s.fireplace)
  const snowOn = usePrefs((s) => s.snow)
  const setFireplace = usePrefs((s) => s.setFireplace)
  const artworks = useProfileArtworks()
  const flip = useRef<FlipBookHandle>(null)
  const [riffling, setRiffling] = useState(false)
  const count = book.pages.length

  const [startPage] = useState(() => {
    const n = Number(params.get('page'))
    return Number.isInteger(n) && n >= 0 && n < count ? n : 0
  })
  const [view, setView] = useState<FlipView>({ index: startPage, orientation: 'landscape' })
  const visible = visiblePages(view, count)

  // The child's coloring for each page, as object URLs the book can display.
  const thumbs = useArtworkThumbs(artworks)
  const pages = useMemo<FlipPage[]>(
    () => book.pages.map((p) => ({ ...p, colorLayer: thumbs.get(`${book.id}:${p.id}`) ?? null })),
    [book, thumbs],
  )

  useEffect(() => {
    if (accountId && profileId)
      void logEvent({ accountId, profileId, type: 'book_open', bookId: book.id, data: { pageIndex: startPage } })
  }, [accountId, profileId, book.id, startPage])

  const turnLog = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onFlip = useCallback(
    (v: FlipView) => {
      setView(v)
      setParams({ page: String(v.index) }, { replace: true })
      clearTimeout(turnLog.current)
      turnLog.current = setTimeout(() => {
        if (accountId && profileId)
          void logEvent({ accountId, profileId, type: 'page_turn', bookId: book.id, data: { pageIndex: v.index } })
      }, 800)
    },
    [accountId, profileId, book.id, setParams],
  )
  useEffect(() => () => clearTimeout(turnLog.current), [])

  const openPage = useCallback(
    (page: { id: string; kind: string }) => {
      if (page.kind === 'line-art') navigate(`/color/${book.id}/${page.id}`)
    },
    [navigate, book.id],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (flipBusy.current) return
      if (e.key === 'ArrowRight') flip.current?.next()
      else if (e.key === 'ArrowLeft') flip.current?.prev()
      else if (e.key === 'Escape') navigate(`/books/${book.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, book.id])

  const flipBusy = useRef(false)
  flipBusy.current = riffling
  useEffect(() => preloadSounds(), [])

  useEffect(() => (fireplace ? startFireplace() : undefined), [fireplace])

  const atStart = visible[0] === 0
  const atEnd = visible[visible.length - 1] === count - 1
  const colorable = visible.map((i) => book.pages[i]).filter((p) => p.kind === 'line-art')
  const [smallScene] = useState(() => window.innerWidth * (window.devicePixelRatio || 1) <= 1300)

  return (
    <main
      className="relative isolate flex h-dvh flex-col overflow-hidden bg-[#c98f55] bg-cover bg-center text-ink-deep"
      style={{ ...accentStyle(book.theme), backgroundImage: sceneBackground('reader', book.season, smallScene) }}
    >
      <h1 className="sr-only">{book.title}</h1>
      {/* Where you are in the book, announced on every screen size. */}
      <p className="sr-only" aria-live="polite">
        {positionLabel(book, visible)}
      </p>
      {isSnowyBook(book) && snowOn ? <Snowfall className="-z-10 opacity-70" /> : null}
      {fireplace ? <div aria-hidden className="ll-fire-glow" /> : null}

      <header className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3 sm:px-6 sm:pt-5 [@media(max-height:560px)]:pt-2">
        <ClayLink to={`/books/${book.id}`} className="min-w-0 max-sm:min-h-14 !pl-5 sm:!pr-8 sm:text-[1.5rem]" aria-label={`Close ${book.title}`}>
          <ArrowLeft className="size-6 shrink-0" strokeWidth={2.6} aria-hidden />
          <span className="hidden truncate sm:inline">{book.title}</span>
        </ClayLink>
        <p className="ll-pill hidden min-w-0 truncate md:block" aria-hidden>
          {positionLabel(book, visible) || book.title}
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <ClayButton
            round
            diameter={56}
            onClick={() => setSound(!sound)}
            aria-pressed={sound}
            aria-label="Page sounds"
          >
            {sound ? <Volume2 className="size-6" aria-hidden /> : <VolumeX className="size-6" aria-hidden />}
          </ClayButton>
          <ClayToggle
            checked={fireplace}
            onChange={setFireplace}
            label="Cozy fireplace sounds"
            icon={<Flame className="size-6" fill={fireplace ? 'currentColor' : 'none'} />}
            tone={{ on: '#e8873a', onDk: '#b4552e' }}
          />
        </div>
      </header>
      <p className="ll-pill mx-auto mt-2 md:hidden" aria-hidden>
        {positionLabel(book, visible) || book.title}
      </p>

      <div className="relative flex min-h-0 flex-1 items-center px-2 py-3 sm:px-4 md:px-24">
        <TurnButton side="prev" placement="side" disabled={atStart || riffling} onClick={() => flip.current?.prev()} />
        {artworks === undefined ? (
          <Splash />
        ) : (
          <FlipBook
            ref={flip}
            pages={pages}
            startPage={startPage}
            ratio={book.pageSize.width / book.pageSize.height}
            onFlip={onFlip}
            onOpenPage={openPage}
            onBusyChange={setRiffling}
            className="size-full"
          />
        )}
        <TurnButton side="next" placement="side" disabled={atEnd || riffling} onClick={() => flip.current?.next()} />
      </div>

      <footer className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-3">
          <TurnButton side="prev" placement="inline" disabled={atStart || riffling} onClick={() => flip.current?.prev()} />
          <div className="flex min-h-[4.5rem] min-w-0 flex-1 flex-wrap items-center justify-center gap-3 [@media(max-height:560px)]:min-h-14">
            {colorable.length > 0 ? (
              colorable.map((p) => (
                <ClayButton
                  key={p.id}
                  onClick={() => openPage(p)}
                  disabled={riffling}
                  aria-label={colorable.length === 1 ? `Color this page: ${p.title}` : `Color ${p.title}`}
                  size={colorable.length === 1 ? 'lg' : 'md'}
                  className="max-w-full max-sm:!min-h-[60px] max-sm:!px-5 max-sm:!text-[1.25rem] [@media(max-height:560px)]:!min-h-12 [@media(max-height:560px)]:!text-[1.125rem]"
                >
                  <Paintbrush className="size-7 shrink-0 max-sm:size-6" aria-hidden />
                  {colorable.length === 1 ? 'Color this page' : p.title}
                </ClayButton>
              ))
            ) : (
              <PaperCard flat tilt={-1} className="px-5 py-3 text-center font-bold">
                {atStart ? 'Swipe or drag the corner to open the book.' : 'That’s the end. Flip back to color more.'}
              </PaperCard>
            )}
          </div>
          <TurnButton side="next" placement="inline" disabled={atEnd || riffling} onClick={() => flip.current?.next()} />
        </div>

        {/* Every page, on a strip of washi tape */}
        <div className="relative mx-auto mt-3 w-fit max-w-full [@media(max-height:560px)]:hidden">
          <Tape variant="rainbow" className="!z-0 !top-1/2 !left-[-1.5rem] !h-11 !w-[calc(100%+3rem)] -translate-y-1/2 -rotate-1 opacity-85" />
          <nav aria-label="Pages" className="ll-strip relative z-10 flex gap-3 overflow-x-auto px-2 pt-3 pb-2">
            {book.pages.map((p, i) => {
              const on = visible.includes(i)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    if (!riffling) flip.current?.flipTo(i)
                  }}
                  aria-disabled={riffling || undefined}
                  aria-label={`Go to ${p.title}`}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'aspect-[210/297] h-[3.75rem] shrink-0 rounded-[4px] bg-[#fffdf8] p-1 shadow-[0_6px_10px_-6px_rgb(40_20_5/0.6)] transition-transform sm:h-20',
                    on ? '-translate-y-2 shadow-[0_0_0_3px_var(--acc),0_8px_12px_-6px_rgb(40_20_5/0.6)]' : 'hover:-translate-y-1',
                  )}
                >
                  <img src={p.thumb} alt="" className="size-full rounded-[2px] object-cover object-top" draggable={false} />
                </button>
              )
            })}
          </nav>
        </div>
      </footer>
    </main>
  )
}

function TurnButton({
  side,
  placement,
  disabled,
  onClick,
}: {
  side: 'prev' | 'next'
  /** side: beside the book on tablets and up; inline: in the footer on phones. */
  placement: 'side' | 'inline'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight
  return (
    <ClayButton
      round
      diameter={placement === 'side' ? 84 : 56}
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'prev' ? 'Previous page' : 'Next page'}
      className={cn(
        'z-10 shrink-0',
        placement === 'side'
          ? cn('!absolute top-1/2 !hidden -translate-y-1/2 md:!inline-flex', side === 'prev' ? 'left-4' : 'right-4')
          : 'md:!hidden',
      )}
    >
      <Icon className={placement === 'side' ? 'size-11' : 'size-8'} strokeWidth={3} aria-hidden />
    </ClayButton>
  )
}
