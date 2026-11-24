import { ArrowLeft, ChevronLeft, ChevronRight, Paintbrush, Volume2, VolumeX } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { FlipBook, type FlipBookHandle, type FlipPage, type FlipView } from '../components/FlipBook'
import { cn } from '../components/ui'
import { getBook, type Book } from '../content/books'
import { logEvent } from '../data/events'
import { visiblePages } from '../lib/spread'
import type { Artwork } from '../data/types'
import { useProfileArtworks } from '../state/hooks'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'

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
  const book = bookId ? getBook(bookId) : undefined
  if (!book) return <NotFound />
  return <Reader key={book.id} book={book} />
}

function Reader({ book }: { book: Book }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const accountId = useSession((s) => s.account?.id)
  const profileId = useSession((s) => s.profileId)
  const sound = usePrefs((s) => s.sound)
  const setSound = usePrefs((s) => s.setSound)
  const artworks = useProfileArtworks()
  const flip = useRef<FlipBookHandle>(null)
  const count = book.pages.length

  const [startPage] = useState(() => {
    const n = Number(params.get('page'))
    return Number.isInteger(n) && n >= 0 && n < count ? n : 0
  })
  const [view, setView] = useState<FlipView>({ index: startPage, orientation: 'landscape' })
  const visible = visiblePages(view, count)

  // The child's coloring for each page, as object URLs the book can display.
  const colorUrls = useColorLayerUrls(artworks, book.id)
  const pages = useMemo<FlipPage[]>(
    () => book.pages.map((p) => ({ ...p, colorLayer: colorUrls.get(p.id) ?? null })),
    [book, colorUrls],
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
      if (e.key === 'ArrowRight') flip.current?.next()
      else if (e.key === 'ArrowLeft') flip.current?.prev()
      else if (e.key === 'Escape') navigate(`/books/${book.id}`)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, book.id])

  const atStart = visible[0] === 0
  const atEnd = visible[visible.length - 1] === count - 1
  const colorable = visible.map((i) => book.pages[i]).filter((p) => p.kind === 'line-art')

  return (
    <div
      className="flex h-dvh flex-col overflow-hidden text-white"
      style={{
        backgroundColor: book.theme.deep,
        backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, ${book.theme.deep} 70%, white 12%), transparent 75%)`,
      }}
    >
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
        <button
          type="button"
          onClick={() => setSound(!sound)}
          aria-pressed={sound}
          aria-label={sound ? 'Turn page sounds off' : 'Turn page sounds on'}
          className="grid size-11 place-items-center rounded-full text-white/90 hover:bg-white/10"
        >
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center px-2 py-4 sm:px-4 md:px-20">
        <TurnButton side="prev" placement="side" disabled={atStart} onClick={() => flip.current?.prev()} />
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
            className="size-full"
          />
        )}
        <TurnButton side="next" placement="side" disabled={atEnd} onClick={() => flip.current?.next()} />
      </div>

      <footer className="shrink-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5">
        <div className="mx-auto flex max-w-4xl items-center justify-center gap-3">
          <TurnButton side="prev" placement="inline" disabled={atStart} onClick={() => flip.current?.prev()} />
          <div className="flex min-h-14 flex-1 flex-wrap items-center justify-center gap-2">
            {colorable.length > 0 ? (
              colorable.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openPage(p)}
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
          <TurnButton side="next" placement="inline" disabled={atEnd} onClick={() => flip.current?.next()} />
        </div>

        <nav aria-label="Pages" className="mx-auto mt-3 flex max-w-4xl justify-center gap-2 overflow-x-auto pb-1">
          {book.pages.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => flip.current?.flipTo(i)}
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

/** Object URLs for each page's saved color layer, revoked when they change. */
function useColorLayerUrls(artworks: Artwork[] | undefined, bookId: string): Map<string, string> {
  const urls = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of artworks ?? []) {
      const blob = a.thumb ?? a.colorLayer
      if (a.bookId === bookId && blob) map.set(a.pageId, URL.createObjectURL(blob))
    }
    return map
  }, [artworks, bookId])
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls])
  return urls
}
