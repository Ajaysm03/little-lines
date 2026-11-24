import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { FlipBook, type FlipBookHandle, type FlipPage, type FlipView } from '../components/FlipBook'
import { cn, Spinner } from '../components/ui'
import { BUNDLED_BOOKS, type Book } from '../content/books'
import { api } from '../data/api'
import { visiblePages } from '../lib/spread'
import { useTitle } from '../lib/useTitle'
import { catalogToBook } from '../state/library-store'

/**
 * The book in the same flip-book reader families use, for checking a draft
 * before publishing. Nothing is logged and nothing can be colored here.
 */
export function AdminBookPreview() {
  const { id = '' } = useParams()
  const bundled = BUNDLED_BOOKS.find((b) => b.id === id)
  const [book, setBook] = useState<Book | null>(bundled ?? null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (bundled) return
    api
      .adminBook(id)
      .then((b) => setBook(catalogToBook(b)))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Couldn’t load the book.'))
  }, [id, bundled])

  useTitle(book ? `Preview: ${book.title}` : 'Preview')

  if (error || !book)
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-deep px-4 text-white">
        {error ? (
          <div className="text-center">
            <p>{error}</p>
            <Link to={`/admin/books/${id}`} className="mt-4 inline-block font-semibold underline">
              Back to the book
            </Link>
          </div>
        ) : (
          <Spinner className="size-6" />
        )}
      </div>
    )
  return <Preview book={book} />
}

function Preview({ book }: { book: Book }) {
  const flip = useRef<FlipBookHandle>(null)
  const [view, setView] = useState<FlipView>({ index: 0, orientation: 'landscape' })
  const [busy, setBusy] = useState(false)
  const count = book.pages.length
  const visible = visiblePages(view, count)
  const pages = useMemo<FlipPage[]>(() => book.pages.map((p) => ({ ...p, colorLayer: null })), [book])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return
      if (e.key === 'ArrowRight') flip.current?.next()
      else if (e.key === 'ArrowLeft') flip.current?.prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy])

  const atStart = visible[0] === 0
  const atEnd = visible[visible.length - 1] === count - 1

  return (
    <div
      className="relative isolate flex h-dvh flex-col overflow-hidden text-white"
      style={{
        backgroundColor: book.theme.deep,
        backgroundImage: `radial-gradient(ellipse 70% 60% at 50% 45%, color-mix(in srgb, ${book.theme.deep} 70%, white 12%), transparent 75%)`,
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 px-3 pt-3 sm:px-5">
        <Link to={`/admin/books/${book.id}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-white/90 hover:bg-white/10">
          <ArrowLeft className="size-5" /> <span className="hidden sm:inline">Back to the book</span>
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="truncate font-display text-[1.25rem] font-bold">{book.title}</h1>
          <p className="text-[0.875rem] text-white/70">Preview: this is how families see the book</p>
        </div>
        <span className="w-11 sm:w-40" />
      </header>

      <div className="relative flex min-h-0 flex-1 items-center px-2 py-4 sm:px-4 md:px-20">
        <TurnButton side="prev" disabled={atStart || busy} onClick={() => flip.current?.prev()} />
        <FlipBook
          ref={flip}
          pages={pages}
          startPage={0}
          ratio={book.pageSize.width / book.pageSize.height}
          onFlip={setView}
          onBusyChange={setBusy}
          className="size-full"
        />
        <TurnButton side="next" disabled={atEnd || busy} onClick={() => flip.current?.next()} />
      </div>

      <nav aria-label="Pages" className="mx-auto flex max-w-4xl shrink-0 justify-center gap-2 overflow-x-auto px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {book.pages.map((p, i) => (
          <button
            key={p.id}
            type="button"
            onClick={() => flip.current?.flipTo(i)}
            disabled={busy}
            aria-label={`Go to ${p.title}`}
            aria-current={visible.includes(i) ? 'page' : undefined}
            className={cn(
              'h-14 shrink-0 overflow-hidden rounded-[3px] bg-white transition-[opacity,box-shadow] sm:h-16',
              visible.includes(i) ? 'opacity-100 shadow-[0_0_0_3px_var(--color-sunflower)]' : 'opacity-55 hover:opacity-90',
            )}
            style={{ aspectRatio: `${book.pageSize.width} / ${book.pageSize.height}` }}
          >
            <img src={p.thumb} alt="" className="size-full object-cover" draggable={false} />
          </button>
        ))}
      </nav>
    </div>
  )
}

function TurnButton({ side, disabled, onClick }: { side: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  const Icon = side === 'prev' ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={side === 'prev' ? 'Previous page' : 'Next page'}
      className={cn(
        'absolute top-1/2 z-10 hidden size-14 -translate-y-1/2 place-items-center rounded-full bg-white/12 text-white hover:bg-white/22 disabled:opacity-25 md:grid',
        side === 'prev' ? 'left-4' : 'right-4',
      )}
    >
      <Icon className="size-7" />
    </button>
  )
}
