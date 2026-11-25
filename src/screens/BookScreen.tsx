import { ArrowLeft, Lock } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link, useParams } from 'react-router'
import { BookCover } from '../components/BookCover'
import { Chip, ClayLink, PaperCard, Tape } from '../components/cozy'
import { artworkIndex, pageState, PaperPage, type PageState } from '../components/cozy/PageCards'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { TAB_BAR_SPACE, TabBar } from '../components/cozy/TabBar'
import { colorablePages, type Book, type BookPage } from '../content/books'
import { SEASON_LABELS, sceneSeason } from '../content/scenes'
import { isBookLocked } from '../data/plans'
import { bookProgress, type BookProgress } from '../data/progress'
import { accentStyle, bookAccent, readableOn } from '../lib/accent'
import { useTitle } from '../lib/useTitle'
import { useArtworkThumbs, useProfileArtworks } from '../state/hooks'
import { useBook, useLibrary } from '../state/library-store'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'

interface BookData {
  book: Book
  pages: Array<{ page: BookPage; state: PageState }>
  progress: BookProgress
  locked: boolean
  thumbs: Map<string, string>
  /** The first page that isn't finished (for "Color a page"). */
  next: BookPage | undefined
}

export function BookScreen() {
  const { bookId } = useParams()
  const book = useBook(bookId)
  useTitle(book?.title)
  const loaded = useLibrary((s) => s.loaded)
  const artworks = useProfileArtworks()
  const thumbs = useArtworkThumbs(artworks)
  const plan = useSession((s) => s.account?.plan)
  if (!book) return loaded ? <NotFound /> : <Splash />
  const arts = artworks ?? []
  const artFor = artworkIndex(arts)
  const pages = colorablePages(book).map((page) => ({ page, state: pageState(artFor(book, page)) }))
  const data: BookData = {
    book,
    pages,
    progress: bookProgress(book, arts),
    locked: isBookLocked(book, plan),
    thumbs,
    next: (pages.find((p) => p.state.status === 'progress') ?? pages.find((p) => p.state.status === 'new') ?? pages[0])?.page,
  }
  return (
    <div style={accentStyle(book.theme)}>
      <Scene scene="book" season={book.season} fit="contain" main className="h-dvh" pins={<BookPins {...data} />}>
        <BookStacked {...data} />
      </Scene>
    </div>
  )
}

/** "Cozy Christmas" → a small first word over a big rest, the way the cover sets it. */
function TitleLines({ title, accent, big }: { title: string; accent: string; big?: boolean }) {
  const words = title.trim().split(/\s+/)
  const [first, rest] = words.length > 1 ? [words[0], words.slice(1).join(' ')] : ['', title]
  const width = big ? 540 : 300
  const size = Math.min(big ? 92 : 60, Math.floor(width / (0.56 * Math.max(4, rest.length))))
  return (
    <h1 id="book-h" className="text-center font-book leading-[0.95] font-normal" style={{ fontSize: size }}>
      {first ? (
        <span className="block text-[#9a6b12]" style={{ fontSize: Math.round(size * 0.87) }}>
          {first}
        </span>
      ) : null}
      <span className="block" style={{ color: readableOn(accent) }}>
        {rest}
      </span>
    </h1>
  )
}

function PagesProgress({ progress, big }: { progress: BookProgress; big?: boolean }) {
  const done = progress.total ? (progress.finished / progress.total) * 100 : 0
  const started = progress.total ? (progress.started / progress.total) * 100 * 0.45 : 0
  const text = progress.status === 'finished' ? 'All pages finished!' : `${progress.finished} of ${progress.total} pages finished`
  const more = progress.started ? `, ${progress.started} more in progress` : ''
  return (
    <div
      role="progressbar"
      aria-label="Pages finished"
      aria-valuemin={0}
      aria-valuemax={progress.total}
      aria-valuenow={progress.finished}
      aria-valuetext={text + more}
      className="relative grid place-items-center overflow-hidden rounded-full shadow-[inset_0_0_0_3px_rgb(110_80_55_/_0.5)]"
      style={{ width: big ? 452 : '100%', height: big ? 58 : 48 }}
    >
      <div className="ll-crayon-fill" style={{ width: `${done}%`, ['--f' as string]: '#e2ae45' }} />
      <div className="ll-crayon-fill" style={{ left: `${done}%`, width: `${started}%`, borderRadius: '0 999px 999px 0', ['--f' as string]: '#f3d58f' }} />
      <span className={big ? 'relative font-display text-[28px] leading-none font-semibold text-ink-deep' : 'relative font-display text-[1.25rem] leading-none font-semibold text-ink-deep'}>
        {text}
      </span>
    </div>
  )
}

function Squiggle() {
  return (
    <svg viewBox="0 0 200 14" className="mt-3 h-3.5 w-48" aria-hidden>
      <path d="M3 9 C 30 2, 45 13, 70 7 S 115 2, 138 8 S 180 12, 197 5" fill="none" stroke="var(--acc)" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

function BookFacts({ d, big }: { d: BookData; big?: boolean }) {
  const { book, progress, locked, next } = d
  return (
    <>
      <TitleLines title={book.title} accent={bookAccent(book.theme).acc} big={big} />
      <Squiggle />
      <p className={big ? 'mt-3 text-center text-[28px] leading-[1.2] font-bold text-ink-deep' : 'mt-3 text-center text-[1.25rem] leading-snug font-bold text-ink-deep'}>
        {book.subtitle}
      </p>
      <ul aria-label="About this book" className={big ? 'mt-5 flex flex-wrap justify-center gap-3' : 'mt-4 flex flex-wrap justify-center gap-2.5'}>
        <li>
          <Chip tone="gold">{book.ageRange ? `Ages ${book.ageRange}` : 'All ages'}</Chip>
        </li>
        <li>
          <Chip tone="pine">{progress.total} pages</Chip>
        </li>
        <li>
          <Chip tone="sky">{SEASON_LABELS[book.season ?? sceneSeason(null)]}</Chip>
        </li>
      </ul>
      {locked ? (
        <div className={big ? 'mt-9 flex items-start gap-4 rounded-[28px] bg-cream px-6 py-5 ring-2 ring-mist/70' : 'mt-6 flex items-start gap-4 rounded-[28px] bg-cream px-5 py-4 ring-2 ring-mist/70'}>
          <span className="grid size-12 shrink-0 place-items-center rounded-full bg-[var(--ll-honey)] text-ink-deep">
            <Lock className="size-6" strokeWidth={2.5} aria-hidden />
          </span>
          <div>
            <p className={big ? 'font-display text-[26px] font-semibold text-ink-deep' : 'font-display text-[1.25rem] font-semibold text-ink-deep'}>This is a Premium book</p>
            <p className={big ? 'mt-1 text-[19px] font-bold text-graphite' : 'mt-1 font-bold text-graphite'}>Ask a grown-up to unlock it. Until then, pick another book in the library.</p>
          </div>
        </div>
      ) : (
        <>
          <div className={big ? 'mt-6' : 'mt-6 w-full'}>
            <PagesProgress progress={progress} big={big} />
          </div>
          <div className={big ? 'mt-6 flex items-center gap-[18px]' : 'mt-6 flex flex-wrap items-center justify-center gap-4'}>
            <ClayLink to={`/books/${book.id}/read`} size={big ? 'lg' : 'md'} className={big ? '!h-[88px] !px-11 !text-[36px]' : ''}>
              Open the book
            </ClayLink>
            {next ? (
              <ClayLink
                to={`/color/${book.id}/${next.id}`}
                tone="cream"
                className={big ? '!h-[88px] !w-[156px] !px-3 text-center !text-[25px] !leading-[1.05]' : ''}
              >
                Color a page
              </ClayLink>
            ) : null}
          </div>
        </>
      )}
    </>
  )
}

const TAPES = ['kraft', 'kraft', 'cran', 'cran'] as const

function BookPins(d: BookData) {
  const { layout } = useSceneLayout()
  if (layout !== 'scene') return null
  const { book, locked } = d
  const cover = <BookCover book={book} eager className="h-full !aspect-auto" />
  const standStyle: CSSProperties = { transform: 'perspective(900px) rotateX(4deg) rotate(-0.6deg)', transformOrigin: '50% 100%' }
  return (
    <>
      <ScenePin x={44} y={40}>
        <ClayLink to="/library" tone="cream" size="sm" className="!h-[66px] !pr-[30px] !pl-5 !text-[30px]">
          <ArrowLeft className="size-8" strokeWidth={2.6} aria-hidden /> Library
        </ClayLink>
      </ScenePin>

      {/* The book, standing on the wooden stand */}
      <ScenePin x={196} y={234} w={290} h={410} style={standStyle}>
        {locked ? (
          <div className="relative size-full">
            {cover}
            <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-ink-deep/85 px-3 py-1.5 text-[17px] font-bold text-white">
              <Lock className="size-4" strokeWidth={2.5} aria-hidden /> Premium
            </span>
          </div>
        ) : (
          <Link to={`/books/${book.id}/read`} aria-label={`Open ${book.title}`} className="group block size-full">
            <span className="block size-full transition-transform duration-200 group-hover:-translate-y-1.5">{cover}</span>
          </Link>
        )}
      </ScenePin>

      <ScenePin x={664} y={68} w={630} className="z-10">
        <section aria-labelledby="book-h" className="relative pt-[14px]">
          <Tape variant="cran" className="top-0 left-[230px] !w-[170px] -rotate-2" />
          <PaperCard className="flex flex-col items-center px-10 pt-10 pb-8">
            <BookFacts d={d} big />
          </PaperCard>
        </section>
      </ScenePin>

      {locked ? null : (
        <section aria-labelledby="pages-h" className="pointer-events-none inset-0">
          <ScenePin x={74} y={770}>
            <h2 id="pages-h" className="ll-scene-heading font-display text-[54px] leading-none font-semibold">
              Pages
            </h2>
          </ScenePin>
          <ScenePin x={226} y={716} w={1140} h={308}>
            <div className="ll-strip flex size-full items-start gap-[45px] overflow-x-auto pt-5 pr-8 pl-6">
              {d.pages.map(({ page, state }, i) => (
                <PaperPage
                  key={page.id}
                  book={book}
                  page={page}
                  state={state}
                  colorUrl={d.thumbs.get(`${book.id}:${page.id}`)}
                  tape={TAPES[i % TAPES.length]}
                  stickerSize={64}
                  className="h-[272px] w-[208px] shrink-0 !p-2.5"
                />
              ))}
            </div>
          </ScenePin>
        </section>
      )}
    </>
  )
}

function BookStacked(d: BookData) {
  const { layout } = useSceneLayout()
  if (layout !== 'band') return null
  const { book, locked } = d
  return (
    <div className={`-mt-8 flex flex-col items-center gap-8 px-4 ${TAB_BAR_SPACE}`}>
      <div className="flex w-full max-w-xl">
        <ClayLink to="/library" tone="cream" size="sm">
          <ArrowLeft className="size-5" strokeWidth={2.6} aria-hidden /> Library
        </ClayLink>
      </div>
      <div className="flex w-full max-w-xl justify-center">
        <div className="w-40 -rotate-2">
          {locked ? (
            <BookCover book={book} eager />
          ) : (
            <Link to={`/books/${book.id}/read`} aria-label={`Open ${book.title}`} className="block">
              <BookCover book={book} eager />
            </Link>
          )}
        </div>
      </div>
      <section aria-labelledby="book-h" className="relative w-full max-w-xl">
        <Tape variant="cran" className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
        <PaperCard className="flex flex-col items-center px-5 pt-8 pb-7">
          <BookFacts d={d} />
        </PaperCard>
      </section>
      {locked ? null : (
        <section aria-labelledby="pages-h-s" className="w-full max-w-xl">
          <h2 id="pages-h-s" className="font-display text-[1.75rem] font-semibold text-ink-deep">
            Pages
          </h2>
          <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-8">
            {d.pages.map(({ page, state }, i) => (
              <li key={page.id}>
                <PaperPage
                  book={book}
                  page={page}
                  state={state}
                  colorUrl={d.thumbs.get(`${book.id}:${page.id}`)}
                  tape={TAPES[i % TAPES.length]}
                  stickerSize={48}
                  className="aspect-[208/272] w-full"
                />
              </li>
            ))}
          </ul>
        </section>
      )}
      <TabBar variant="fixed" />
    </div>
  )
}
