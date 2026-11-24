import { ArrowLeft } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { BookCover } from '../components/BookCover'
import { colorablePages, getBook } from '../content/books'
import { NotFound } from './NotFound'

export function BookScreen() {
  const { bookId } = useParams()
  const book = bookId ? getBook(bookId) : undefined
  if (!book) return <NotFound />
  const pages = colorablePages(book)

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <Link to="/library" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost">
        <ArrowLeft className="size-5" /> Library
      </Link>

      <div className="mt-6 grid gap-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-10">
        <BookCover book={book} eager className="w-48 sm:w-full" />
        <div className="max-w-prose">
          <h1 className="font-display text-display font-extrabold" style={{ color: book.theme.deep }}>
            {book.title}
          </h1>
          <p className="mt-2 text-[1.125rem] text-graphite">{book.subtitle}</p>
          <p className="mt-5">{book.description}</p>
          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.9375rem]">
            <dt className="text-graphite">Pages to color</dt>
            <dd className="font-semibold">{pages.length}</dd>
            <dt className="text-graphite">Best for</dt>
            <dd className="font-semibold">Ages {book.ageRange}</dd>
          </dl>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Topics">
            {book.tags.map((t) => (
              <li key={t} className="rounded-full bg-paper px-3 py-1 text-[0.875rem] font-semibold text-ink ring-2 ring-inset ring-mist">
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section aria-labelledby="pages-h" className="mt-12">
        <h2 id="pages-h" className="font-display text-heading font-bold text-ink-deep">
          Pages
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {pages.map((page, i) => (
            <li key={page.id}>
              <span className="block aspect-[210/297] overflow-hidden rounded-[4px] bg-paper shadow-paper">
                <img src={page.thumb} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              </span>
              <span className="mt-3 block font-semibold text-ink-deep">
                <span className="text-graphite">Page {i + 1}: </span>
                {page.title}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
