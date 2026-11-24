import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BookCover } from '../components/BookCover'
import { BUNDLED_BOOKS, colorablePages, type Book, type BookPage } from '../content/books'

export function LibraryScreen() {
  const [query, setQuery] = useState('')
  const books = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return BUNDLED_BOOKS
    return BUNDLED_BOOKS.filter(
      (b) =>
        b.title.toLowerCase().includes(q) ||
        b.tags.some((t) => t.toLowerCase().includes(q)) ||
        b.pages.some((p) => p.title.toLowerCase().includes(q)),
    )
  }, [query])

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-title font-extrabold text-ink-deep">Library</h1>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search books and pages</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-graphite" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books and pages"
            className="min-h-12 w-full rounded-full bg-paper pr-4 pl-12 ring-2 ring-inset ring-mist outline-none focus:ring-sky"
          />
        </label>
      </div>

      {books.length === 0 ? (
        <p className="mt-12 text-graphite">No books or pages match “{query}”. Try a different word.</p>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {books.map((book) => (
            <li key={book.id}>
              <Link to={`/books/${book.id}`} className="group block rounded-md">
                <BookCover book={book} className="transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98]" />
                <p className="mt-3 font-semibold text-ink-deep">{book.title}</p>
                <p className="text-[0.9375rem] text-graphite">{colorablePages(book).length} pages to color</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

/** A line-art page on paper, used in quick lists. */
export function PageTile({ book, page }: { book: Book; page: BookPage }) {
  return (
    <Link to={`/books/${book.id}`} className="group block rounded-md">
      <span className="block aspect-[210/297] overflow-hidden rounded-[4px] bg-paper shadow-paper transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98]">
        <img src={page.thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      </span>
      <span className="mt-3 block font-semibold text-ink-deep">{page.title}</span>
    </Link>
  )
}
