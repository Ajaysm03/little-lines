import { ArrowLeft, BookOpen } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { BookCover } from '../components/BookCover'
import { PageTile, ProgressBar } from '../components/BookCard'
import { ButtonLink } from '../components/ui'
import { colorablePages } from '../content/books'
import { bookProgress, progressLabel } from '../data/progress'
import { useArtworkThumbs, useProfileArtworks } from '../state/hooks'
import { useBook, useLibrary } from '../state/library-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'
import { useTitle } from '../lib/useTitle'

export function BookScreen() {
  const { bookId } = useParams()
  const book = useBook(bookId)
  useTitle(book?.title)
  const loaded = useLibrary((s) => s.loaded)
  const artworks = useProfileArtworks() ?? []
  const thumbs = useArtworkThumbs(artworks)
  if (!book) return loaded ? <NotFound /> : <Splash />
  const pages = colorablePages(book)
  const progress = bookProgress(book, artworks)

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <Link to="/library" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost">
        <ArrowLeft className="size-5" /> Library
      </Link>

      <div className="mt-6 grid gap-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-10">
        <Link to={`/books/${book.id}/read`} aria-label={`Open ${book.title}`} className="group block w-48 rounded-md sm:w-full">
          <BookCover book={book} eager className="transition-transform duration-200 group-hover:-translate-y-1" />
        </Link>
        <div className="max-w-prose">
          <h1 className="font-display text-display font-extrabold" style={{ color: book.theme.deep }}>
            {book.title}
          </h1>
          <p className="mt-2 text-[1.125rem] text-graphite">{book.subtitle}</p>
          <p className="mt-5">{book.description}</p>

          <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
            <ButtonLink to={`/books/${book.id}/read`} size="lg">
              <BookOpen className="size-5" /> Open the book
            </ButtonLink>
            <div className="min-w-48 flex-1">
              <ProgressBar value={progress.fraction} />
              <p className="mt-1.5 text-[0.9375rem] text-graphite">{progressLabel(progress)}</p>
            </div>
          </div>

          <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.9375rem]">
            <dt className="text-graphite">Best for</dt>
            <dd className="font-semibold">{book.ageRange ? `Ages ${book.ageRange}` : 'All ages'}</dd>
          </dl>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label="Topics">
            {book.tags.map((t) => (
              <li key={t} className="rounded-full bg-paper px-3 py-1 text-[0.875rem] font-semibold text-ink ring-2 ring-inset ring-mist">
                #{t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <section aria-labelledby="pages-h" className="mt-12">
        <h2 id="pages-h" className="font-display text-heading font-bold text-ink-deep">
          Pick a page to color
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {pages.map((page) => (
            <li key={page.id}>
              <PageTile
                book={book}
                page={page}
                label={`Page ${book.pages.indexOf(page)}`}
                colorUrl={thumbs.get(`${book.id}:${page.id}`)}
                done={artworks.some((a) => a.bookId === book.id && a.pageId === page.id && a.completedAt)}
              />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
