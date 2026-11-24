import { ArrowLeft, ChevronLeft, ChevronRight, Flame, Paintbrush, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router'
import { FlipBook, type FlipBookHandle, type FlipPage, type FlipView } from '../components/FlipBook'
import { cn } from '../components/ui'
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

  return (
    <div
      className="relative isolate flex h-dvh flex-col overflow-hidden text-white"
      style={{
        backgroundColor: book.theme.deep,
        backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, ${book.theme.deep} 70%, white 12%), transparent 75%)`,
      }}
    >
      {isSnowyBook(book) ? <Snowfall className="-z-10" /> : null}
      <header className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3 sm:px-5">
        <Link
          to={`/books/${book.id}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-white/90 hover:bg-white/10"
        >
          <ArrowLeft className="size-5" /> <span className="hidden sm:inline">Close book</span>
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="truncate font-display text-[1.25rem] font-bold">{book.title}</h1>
          <p className="text-[0.875rem] text-white/70" aria-live="polite">
            {positionLabel(book, visible)}
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setFireplace(!fireplace)}
            aria-pressed={fireplace}
            aria-label={fireplace ? 'Turn fireplace sounds off' : 'Turn fireplace sounds on'}
            title="Cozy fireplace sounds"
            className={cn(
              'grid size-11 place-items-center rounded-full hover:bg-white/10',
              fireplace ? 'text-sunflower' : 'text-white/70',
            )}
          >
            <Flame className={cn('size-5', fireplace && 'fill-current')} />
          </button>
          <button
            type="button"
            onClick={() => setSound(!sound)}
            aria-pressed={sound}
            aria-label={sound ? 'Turn page sounds off' : 'Turn page sounds on'}
            className="grid size-11 place-items-center rounded-full text-white/90 hover:bg-white/10"
          >
            {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
          </button>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center px-2 py-4 sm:px-4 md:px-20">
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
          <div className="flex min-h-14 flex-1 flex-wrap items-center justify-center gap-2">
            {colorable.length > 0 ? (
              colorable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPage(p)}
                  disabled={riffling}
                  className="inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-5 font-semibold text-ink-deep shadow-lift transition-transform active:scale-95"
                >
                  <Paintbrush className="size-5" style={{ color: book.theme.accent }} />
                  {colorable.length === 1 ? 'Color this page' : p.title}
                </button>
              ))
            ) : (
              <p className="text-center text-white/75">
                {atStart ? 'Swipe or drag the corner to open the book.' : 'That’s the end. Flip back to color more.'}
              </p>
            )}
          </div>
          <TurnButton side="next" placement="inline" disabled={atEnd || riffling} onClick={() => flip.current?.next()} />
        </div>

        <nav aria-label="Pages" className="mx-auto mt-3 flex max-w-4xl justify-center gap-2 overflow-x-auto pb-1">
          {book.pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => flip.current?.flipTo(i)}
              disabled={riffling}
              aria-label={`Go to ${p.title}`}
              aria-current={visible.includes(i) ? 'page' : undefined}
              className={cn(
                'aspect-[210/297] h-14 shrink-0 overflow-hidden rounded-[3px] bg-white transition-[opacity,box-shadow,transform] sm:h-16',
                visible.includes(i)
                  ? 'opacity-100 shadow-[0_0_0_3px_var(--color-sunflower)]'
                  : 'opacity-55 hover:-translate-y-0.5 hover:opacity-90',
              )}
            >
              <img src={p.thumb} alt="" className="size-full object-cover" draggable={false} />
            </button>
          ))}
        </nav>
      </footer>
    </div>
  )
}

function TurnButton({
  side,
  placement,
  disabled,
  onClick,
}: {
  side: 'prev' | 'next'
  /** side: floating beside the book on tablets and up; inline: in the footer on phones. */
  placement: 'side' | 'inline'
  disabled: boolean
  onClick: () => void
}) {
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'prev' ? 'Previous page' : 'Next page'}
      className={cn(
        'z-10 shrink-0 place-items-center rounded-full bg-white/12 text-white transition-[background-color,opacity,transform] hover:bg-white/22 active:scale-90 disabled:opacity-25',
        placement === 'side'
          ? cn('absolute top-1/2 hidden size-14 -translate-y-1/2 md:grid', side === 'prev' ? 'left-4' : 'right-4')
          : 'grid size-12 md:hidden',
      )}
    >
      <Icon className="size-7" />
    </button>
  )
}
