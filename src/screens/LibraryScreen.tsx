import { Lock, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BookCover } from '../components/BookCover'
import { ClayButton, PaperCard, StatusSticker, Tape } from '../components/cozy'
import { artworkIndex, pageState, PaperPage, type PageState, type PageStatus } from '../components/cozy/PageCards'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { TAB_BAR_SPACE, TabBar } from '../components/cozy/TabBar'
import { rovingKeys } from '../components/cozy/roving'
import { cn } from '../components/ui'
import { colorablePages, isNewBook, type Book, type BookPage } from '../content/books'
import { isBookLocked } from '../data/plans'
import { bookProgress, type BookProgress } from '../data/progress'
import { useTitle } from '../lib/useTitle'
import { useArtworkThumbs, useProfileArtworks } from '../state/hooks'
import { useBooks } from '../state/library-store'
import { useSession } from '../state/session-store'

type Filter = 'all' | PageStatus
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'progress', label: 'Still coloring' },
  { id: 'new', label: 'Not started' },
  { id: 'done', label: 'Finished' },
]

interface ShelfBook {
  book: Book
  progress: BookProgress
  locked: boolean
}
interface ShelfPage {
  book: Book
  page: BookPage
  state: PageState
}

interface LibraryData {
  query: string
  setQuery: (q: string) => void
  filter: Filter
  setFilter: (f: Filter) => void
  books: ShelfBook[]
  pages: ShelfPage[]
  thumbs: Map<string, string>
  reset: () => void
}

/** The bookshop: search and filters on a paper sign, books on the middle shelf, pages on the bottom one. */
export function LibraryScreen() {
  useTitle('Library')
  const data = useLibraryData()
  return (
    <Scene scene="library" fit="contain" main className="h-dvh" pins={<LibraryPins {...data} />}>
      <LibraryStacked {...data} />
    </Scene>
  )
}

function useLibraryData(): LibraryData {
  const artworks = useProfileArtworks()
  const thumbs = useArtworkThumbs(artworks)
  const allBooks = useBooks()
  const plan = useSession((s) => s.account?.plan)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const { books, pages } = useMemo(() => {
    const arts = artworks ?? []
    const artFor = artworkIndex(arts)
    const q = query.trim().toLowerCase()
    const books: ShelfBook[] = []
    const pages: ShelfPage[] = []
    for (const book of allBooks) {
      const bookHit = !q || book.title.toLowerCase().includes(q) || book.tags.some((t) => t.toLowerCase().includes(q))
      const colorable = colorablePages(book)
      const pageHits = colorable.filter((p) => bookHit || p.title.toLowerCase().includes(q))
      if (!bookHit && pageHits.length === 0) continue
      const locked = isBookLocked(book, plan)
      books.push({ book, progress: bookProgress(book, arts), locked })
      if (locked) continue
      for (const page of pageHits) {
        const state = pageState(artFor(book, page))
        if (filter === 'all' || state.status === filter) pages.push({ book, page, state })
      }
    }
    return { books, pages }
  }, [allBooks, artworks, plan, query, filter])

  return {
    query,
    setQuery,
    filter,
    setFilter,
    books,
    pages,
    thumbs,
    reset: () => {
      setQuery('')
      setFilter('all')
    },
  }
}

function summary(d: LibraryData) {
  const p = `${d.pages.length} ${d.pages.length === 1 ? 'page' : 'pages'}`
  const b = `${d.books.length} ${d.books.length === 1 ? 'book' : 'books'}`
  return `${p} · ${b}`
}

function SearchAndFilters({ d, big }: { d: LibraryData; big?: boolean }) {
  return (
    <>
      <div className={cn('flex items-center', big ? 'gap-[22px]' : 'flex-wrap gap-4')}>
        <h1 className={big ? 'font-display text-[52px] leading-none font-semibold text-ink' : 'font-display text-[2.25rem] leading-none font-semibold text-ink'}>
          Library
        </h1>
        <label className={cn('relative min-w-0 flex-1', !big && 'basis-60')}>
          <span className="sr-only">Search books and pages</span>
          <input
            type="search"
            value={d.query}
            onChange={(e) => d.setQuery(e.target.value)}
            placeholder="Search books and pages"
            className={cn('ll-field', big ? '!min-h-[60px] !pl-[62px] !text-[22px]' : '!pl-14')}
          />
          <Search className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-graphite', big ? 'left-6 size-7' : 'left-5 size-6')} aria-hidden />
        </label>
      </div>
      <div role="radiogroup" aria-label="Show pages" onKeyDown={rovingKeys} className={cn('flex flex-wrap', big ? 'gap-3' : 'gap-2.5')}>
        {FILTERS.map((f) => (
          <ClayButton
            key={f.id}
            role="radio"
            aria-checked={d.filter === f.id}
            tabIndex={d.filter === f.id ? 0 : -1}
            size="sm"
            tone={d.filter === f.id ? 'cran' : 'cream'}
            onClick={() => d.setFilter(f.id)}
            className={big ? '!h-12 !min-h-12 !px-5 !text-[22px]' : ''}
          >
            {f.label}
          </ClayButton>
        ))}
      </div>
      <p className={big ? 'text-[19px] leading-tight font-bold text-graphite' : 'font-bold text-graphite'} aria-live="polite">
        {summary(d)}
      </p>
    </>
  )
}

function BookOnShelf({ item, w, label }: { item: ShelfBook; w: number | string; label?: boolean }) {
  const { book, progress, locked } = item
  // Names start with what the sticker on the cover says, so voice control matches what's on screen.
  const status =
    progress.status === 'finished'
      ? 'Done!'
      : progress.status === 'in-progress'
        ? `${progress.finished}/${progress.total} pages finished`
        : isNewBook(book)
          ? 'New'
          : 'not started'
  return (
    <div className="relative shrink-0" style={{ width: w }}>
      <Link to={`/books/${book.id}`} aria-label={`${book.title}, ${locked ? 'Premium, ask a grown-up to unlock it' : status}`} className="group block">
        <BookCover book={book} className="transition-transform duration-200 group-hover:-translate-y-1.5" />
        {locked ? (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-ink-deep/85 px-2.5 py-1 text-[0.8125rem] font-bold text-white">
            <Lock className="size-3.5" strokeWidth={2.5} aria-hidden /> Premium
          </span>
        ) : progress.status === 'finished' ? (
          <StatusSticker status="done" size={48} className="!absolute -top-4 -right-3">
            Done!
          </StatusSticker>
        ) : progress.status === 'in-progress' ? (
          <StatusSticker status="progress" size={48} className="!absolute -top-4 -right-3">
            {progress.finished}/{progress.total}
          </StatusSticker>
        ) : isNewBook(book) ? (
          <StatusSticker status="new" size={48} className="!absolute -top-4 -right-3">
            New
          </StatusSticker>
        ) : null}
      </Link>
      {label ? <span className="ll-shelf-label mt-2 block truncate text-center">{book.title}</span> : null}
    </div>
  )
}

const PAGE_TILTS = [-2, 1.5, -1, 2, -1.5, 1]

function LibraryPins(d: LibraryData) {
  const { layout } = useSceneLayout()
  if (layout !== 'scene') return null
  const ghosts = Math.max(0, 3 - d.books.length)
  return (
    <>
      <ScenePin x={282} y={26} w={704}>
        <div className="relative">
          <Tape variant="kraft" className="-top-3 left-[278px] -rotate-2" />
          <PaperCard className="flex flex-col gap-4 px-[34px] py-[26px]">
            <SearchAndFilters d={d} big />
          </PaperCard>
        </div>
      </ScenePin>

      {/* Middle shelf: the books */}
      <ScenePin x={110} y={330} w={1150} h={312}>
        <section aria-label="Books" className="ll-strip flex size-full items-start gap-[42px] overflow-x-auto px-10 pt-[20px]">
          {d.books.map((b) => (
            <BookOnShelf key={b.book.id} item={b} w={154} label />
          ))}
          {d.books.length === 0 ? (
            <PaperCard flat tilt={-1.5} className="mt-10 shrink-0 px-6 py-5 text-[21px] font-bold text-ink-deep">
              <EmptyBooks d={d} />
            </PaperCard>
          ) : null}
          {Array.from({ length: ghosts }, (_, i) => (
            <div key={i} className="shrink-0">
              <div className="ll-ghost-book">
                More
                <br />
                books
                <br />
                soon
              </div>
              {i === 0 ? <span className="ll-shelf-label mt-2 block text-center">Coming soon</span> : null}
            </div>
          ))}
          {d.books.length > 0 && d.books.length <= 3 ? (
            <PaperCard flat tilt={-2} className="mt-[54px] w-[300px] shrink-0 px-[22px] py-[18px]">
              <p className="font-display text-[24px] leading-[1.2] font-semibold text-ink-deep">New books arrive on these shelves.</p>
              <p className="mt-2 text-[17px] leading-[1.3] font-bold text-graphite">Each one brings its own colors and pages.</p>
            </PaperCard>
          ) : null}
        </section>
      </ScenePin>

      {/* Bottom shelf, beside the armchair: the pages */}
      <ScenePin x={420} y={640} w={800} h={204}>
        <section aria-label="Pages" className="ll-strip flex size-full items-start gap-[44px] overflow-x-auto px-4 pt-[20px]">
          {d.pages.map((p, i) => (
            <PaperPage
              key={`${p.book.id}:${p.page.id}`}
              book={p.book}
              page={p.page}
              state={p.state}
              colorUrl={d.thumbs.get(`${p.book.id}:${p.page.id}`)}
              tilt={PAGE_TILTS[i % PAGE_TILTS.length]}
              stickerSize={50}
              className="h-[177px] w-[126px] shrink-0"
            />
          ))}
          {d.pages.length === 0 ? (
            <PaperCard flat className="mt-12 shrink-0 px-6 py-4 text-[21px] leading-[1.3] font-bold text-ink-deep">
              <EmptyPages d={d} />
            </PaperCard>
          ) : null}
        </section>
      </ScenePin>
      <ScenePin x={440} y={850}>
        <span className="ll-shelf-label">Pages</span>
      </ScenePin>

      <TabBar variant="pins" />
    </>
  )
}

function LibraryStacked(d: LibraryData) {
  const { layout } = useSceneLayout()
  if (layout !== 'band') return null
  return (
    <div className={`-mt-8 flex flex-col items-center gap-8 px-4 ${TAB_BAR_SPACE}`}>
      <div className="relative w-full max-w-2xl">
        <Tape variant="kraft" className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
        <PaperCard className="flex flex-col gap-4 px-5 py-6">
          <SearchAndFilters d={d} />
        </PaperCard>
      </div>
      <section aria-labelledby="lib-books" className="w-full max-w-2xl">
        <h2 id="lib-books" className="font-display text-[1.75rem] font-semibold text-ink-deep">
          Books
        </h2>
        {d.books.length ? (
          <ul className="mt-5 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-3">
            {d.books.map((b) => (
              <li key={b.book.id}>
                <BookOnShelf item={b} w="100%" label />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 font-semibold text-graphite">
            <EmptyBooks d={d} />
          </p>
        )}
      </section>
      <section aria-labelledby="lib-pages" className="w-full max-w-2xl">
        <h2 id="lib-pages" className="font-display text-[1.75rem] font-semibold text-ink-deep">
          Pages
        </h2>
        {d.pages.length ? (
          <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">
            {d.pages.map((p, i) => (
              <li key={`${p.book.id}:${p.page.id}`}>
                <PaperPage
                  book={p.book}
                  page={p.page}
                  state={p.state}
                  colorUrl={d.thumbs.get(`${p.book.id}:${p.page.id}`)}
                  tilt={PAGE_TILTS[i % PAGE_TILTS.length] / 2}
                  stickerSize={46}
                  className="aspect-[126/177] w-full"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 font-semibold text-graphite">
            <EmptyPages d={d} />
          </p>
        )}
      </section>
      <TabBar variant="fixed" />
    </div>
  )
}

const linkButton = 'font-bold text-rust underline underline-offset-4'

/** Why the books shelf is empty. */
function EmptyBooks({ d }: { d: LibraryData }) {
  const q = d.query.trim()
  if (!q) return <>No books yet. New ones arrive on these shelves.</>
  return (
    <>
      No books match “{q}”.{' '}
      <button type="button" onClick={d.reset} className={linkButton}>
        Show everything
      </button>
    </>
  )
}

/** Why the pages shelf is empty. */
function EmptyPages({ d }: { d: LibraryData }) {
  const q = d.query.trim()
  if (d.filter !== 'all')
    return (
      <>
        No pages here yet.{' '}
        <button type="button" onClick={() => d.setFilter('all')} className={linkButton}>
          Show all pages
        </button>
      </>
    )
  if (d.books.length > 0 && d.books.every((b) => b.locked)) return <>These books are Premium. Ask a grown-up to unlock them.</>
  if (q)
    return (
      <>
        No pages match “{q}”.{' '}
        <button type="button" onClick={d.reset} className={linkButton}>
          Show everything
        </button>
      </>
    )
  return <>No pages to color yet.</>
}
