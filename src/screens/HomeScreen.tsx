import { Link } from 'react-router'
import { Avatar } from '../components/Avatar'
import { BookCover } from '../components/BookCover'
import { BUNDLED_BOOKS, colorablePages } from '../content/books'
import { useActiveProfile } from '../state/hooks'
import { PageTile } from './LibraryScreen'

export function HomeScreen() {
  const profile = useActiveProfile()
  const featured = BUNDLED_BOOKS[0]

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <header className="flex items-center gap-4">
        {profile ? <Avatar avatar={profile.avatar} color={profile.color} size="md" /> : null}
        <div>
          <h1 className="font-display text-title font-extrabold text-ink-deep">Hi {profile?.name ?? 'there'}!</h1>
          <p className="text-graphite">Pick a page and start coloring.</p>
        </div>
      </header>

      {featured ? (
        <section aria-labelledby="pages-h" className="mt-10">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="pages-h" className="font-display text-heading font-bold text-ink-deep">
              Pages from {featured.title}
            </h2>
            <Link to={`/books/${featured.id}`} className="shrink-0 font-semibold text-ink underline decoration-[var(--crayon)] decoration-[3px] underline-offset-4">
              See the book
            </Link>
          </div>
          <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
            {colorablePages(featured).map((page) => (
              <li key={page.id}>
                <PageTile book={featured} page={page} />
              </li>
            ))}
          </ul>
        </section>
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
              <Link to={`/books/${book.id}`} className="group block rounded-md">
                <BookCover book={book} eager className="transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98]" />
                <p className="mt-3 font-semibold text-ink-deep">{book.title}</p>
                <p className="text-[0.9375rem] text-graphite">{colorablePages(book).length} pages to color</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
