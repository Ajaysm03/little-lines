import { BookOpen } from 'lucide-react'
import { Link } from 'react-router'
import { Avatar } from '../components/Avatar'
import { BookCard, PagePreview, PageTile, ProgressBar } from '../components/BookCard'
import { BUNDLED_BOOKS, colorablePages, getBook, type Book } from '../content/books'
import type { LastRead } from '../data/events'
import { bookProgress, progressLabel } from '../data/progress'
import type { Artwork } from '../data/types'
import { useActiveProfile, useArtworkThumbs, useLastRead, useProfileArtworks } from '../state/hooks'

export function HomeScreen() {
  const profile = useActiveProfile()
  const artworks = useProfileArtworks() ?? []
  const thumbs = useArtworkThumbs(artworks)
  const lastRead = useLastRead()

  const resume = lastRead ? getBook(lastRead.bookId) : undefined
  const pages = BUNDLED_BOOKS.flatMap((book) => colorablePages(book).map((page) => ({ book, page }))).slice(0, 8)

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <header className="flex items-center gap-4">
        {profile ? <Avatar avatar={profile.avatar} color={profile.color} size="md" /> : null}
        <div>
          <h1 className="font-display text-title font-extrabold text-ink-deep">Hi {profile?.name ?? 'there'}!</h1>
          <p className="text-graphite">{resume ? 'Your book is right where you left it.' : 'Pick a book and start coloring.'}</p>
        </div>
      </header>

      {lastRead !== undefined && (resume || BUNDLED_BOOKS[0]) ? (
        <ResumeCard book={resume ?? BUNDLED_BOOKS[0]} lastRead={resume ? lastRead : null} artworks={artworks} thumbs={thumbs} />
      ) : null}

      <section aria-labelledby="books-h" className="mt-12">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="books-h" className="font-display text-heading font-bold text-ink-deep">
            Your books
          </h2>
          <Link to="/library" className="shrink-0 font-semibold text-ink underline decoration-[var(--crayon)] decoration-[3px] underline-offset-4">
            Open the library
          </Link>
        </div>
        <ul className="mt-5 flex gap-6 overflow-x-auto pb-4">
          {BUNDLED_BOOKS.map((book) => (
            <li key={book.id} className="w-40 shrink-0 sm:w-48">
              <BookCard book={book} progress={bookProgress(book, artworks)} eager />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pages-h" className="mt-10">
        <h2 id="pages-h" className="font-display text-heading font-bold text-ink-deep">
          Pages to color
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {pages.map(({ book, page }) => (
            <li key={`${book.id}:${page.id}`}>
              <PageTile
                book={book}
                page={page}
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

/**
 * The book this child was last in, laid out like the reader: a page lying on
 * the book's own night-blue desk. New children get their first book here.
 */
function ResumeCard({
  book,
  lastRead,
  artworks,
  thumbs,
}: {
  book: Book
  lastRead: LastRead | null
  artworks: Artwork[]
  thumbs: Map<string, string>
}) {
  const index = lastRead ? Math.min(lastRead.pageIndex, book.pages.length - 1) : 0
  const page = book.pages[index]
  const progress = bookProgress(book, artworks)
  const where =
    page.kind === 'line-art' ? `Page ${index}: ${page.title}` : page.kind === 'front-cover' ? 'At the front cover' : 'At the back cover'

  return (
    <section
      aria-label={lastRead ? 'Pick up where you left off' : 'Start your first book'}
      className="relative mt-8 overflow-hidden rounded-[28px] text-white"
      style={{ backgroundColor: book.theme.deep }}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-20"
        style={{ backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.55) 1.2px, transparent 1.3px)', backgroundSize: '22px 22px' }}
      />
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:gap-10 sm:p-8">
        <Link
          to={`/books/${book.id}/read?page=${index}`}
          tabIndex={-1}
          aria-hidden
          className="mx-auto w-36 shrink-0 -rotate-3 transition-transform duration-200 hover:-rotate-1 sm:mx-0 sm:w-40"
        >
          <PagePreview
            page={page}
            colorUrl={thumbs.get(`${book.id}:${page.id}`)}
            className="shadow-[0_18px_40px_-14px_rgb(0_0_0/0.6)]"
          />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] text-white/75">{lastRead ? 'Pick up where you left off' : 'Your first book'}</p>
          <h2 className="mt-1 font-display text-title font-extrabold">{book.title}</h2>
          <p className="mt-1 text-white/85">{lastRead ? where : book.subtitle}</p>
          <div className="mt-5 max-w-xs">
            <ProgressBar value={progress.fraction} tone={book.theme.glow} className="bg-white/20" />
            <p className="mt-2 text-[0.9375rem] text-white/80">{progressLabel(progress)}</p>
          </div>
          <Link
            to={`/books/${book.id}/read?page=${index}`}
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-6 font-semibold text-ink-deep shadow-lift transition-transform active:scale-95"
          >
            <BookOpen className="size-5" style={{ color: book.theme.accent }} />
            {lastRead ? 'Keep going' : 'Open the book'}
          </Link>
        </div>
      </div>
    </section>
  )
}
