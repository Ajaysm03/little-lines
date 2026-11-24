import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { getBook } from '../content/books'
import { NotFound } from './NotFound'

/** Where a tapped page opens. The coloring tools themselves arrive in Phase 3. */
export function ColorScreen() {
  const { bookId, pageId } = useParams()
  const book = bookId ? getBook(bookId) : undefined
  const index = book?.pages.findIndex((p) => p.id === pageId) ?? -1
  const page = book && index >= 0 ? book.pages[index] : undefined
  if (!book || !page || page.kind !== 'line-art') return <NotFound />

  return (
    <div className="flex h-dvh flex-col bg-frost">
      <header className="flex items-center justify-between gap-3 px-3 pt-3 sm:px-5">
        <Link
          to={`/books/${book.id}/read?page=${index}`}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-ink hover:bg-paper"
        >
          <ArrowLeft className="size-5" /> Back to the book
        </Link>
        <h1 className="truncate font-display text-[1.25rem] font-bold text-ink-deep">{page.title}</h1>
        <span className="w-24" />
      </header>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4">
        <div className="aspect-[210/297] max-h-full w-auto max-w-full flex-1 overflow-hidden rounded-[4px] bg-paper shadow-paper">
          <img src={page.image} alt={page.title} className="size-full" draggable={false} />
        </div>
        <p className="rounded-full bg-paper px-4 py-2 text-[0.9375rem] text-graphite shadow-lift">
          Coloring tools arrive in Phase 3.
        </p>
      </div>
    </div>
  )
}
