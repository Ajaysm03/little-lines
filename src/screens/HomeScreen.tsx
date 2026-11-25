import { Flame, PartyPopper } from 'lucide-react'
import type { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { BookCover } from '../components/BookCover'
import { ClayButton, ClayLink, CrayonProgress, PaperCard, SignLabel, Tape } from '../components/cozy'
import { artworkIndex, MoreTile, pageState, PaperPage, type PageState } from '../components/cozy/PageCards'
import { Scene, ScenePin, useSceneLayout } from '../components/cozy/Scene'
import { TAB_BAR_SPACE, TabBar } from '../components/cozy/TabBar'
import { StickerBadge } from '../components/Sticker'
import { PagePreview } from '../components/BookCard'
import { colorablePages, type Book, type BookPage } from '../content/books'
import { crayonHex } from '../content/profile-options'
import type { StickerState } from '../data/achievements'
import type { ProfileStats } from '../data/analytics'
import { isBookLocked } from '../data/plans'
import type { Artwork, Profile } from '../data/types'
import { useTitle } from '../lib/useTitle'
import { useActiveProfile, useArtworkThumbs, useLastRead, useProfileArtworks, useProfileInsights } from '../state/hooks'
import { useBooks } from '../state/library-store'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'

interface Pick {
  book: Book
  page: BookPage
  state: PageState
}

interface HomeData {
  profile: Profile | null | undefined
  resume: (Pick & { started: boolean }) | null
  fence: Pick[]
  thumbs: Map<string, string>
  stats: ProfileStats | null
  stickers: StickerState[]
  /** Every page this child can color is finished. */
  allDone: boolean
  onSwitch: () => void
}

/** The village: greeting, the page to keep coloring, the week, signposts, and pages pinned on the fence. */
export function HomeScreen() {
  useTitle('Home')
  const data = useHomeData()
  return (
    <Scene scene="home" fit="contain" snow main className="h-dvh" pins={<HomePins {...data} />}>
      <HomeStacked {...data} />
    </Scene>
  )
}

function useHomeData(): HomeData {
  const profile = useActiveProfile()
  const artworks = useProfileArtworks() ?? []
  const thumbs = useArtworkThumbs(artworks)
  const lastRead = useLastRead()
  const insights = useProfileInsights()
  const plan = useSession((s) => s.account?.plan)
  const leaveProfile = useSession((s) => s.leaveProfile)
  const navigate = useNavigate()
  const books = useBooks().filter((b) => !isBookLocked(b, plan))
  const artFor = artworkIndex(artworks)

  const all: Pick[] = books.flatMap((book) => colorablePages(book).map((page) => ({ book, page, state: pageState(artFor(book, page)) })))
  const resume = pickResume(all, artworks, lastRead?.bookId, lastRead?.pageIndex)
  const others = all.filter((p) => p !== resume && p.state.status !== 'done')
  const fence = [...others.filter((p) => p.state.status === 'progress'), ...others.filter((p) => p.state.status === 'new')].slice(0, 3)

  return {
    profile,
    resume,
    fence,
    allDone: all.length > 0 && all.every((p) => p.state.status === 'done'),
    thumbs,
    stats: insights?.stats ?? null,
    stickers: insights?.stickers ?? [],
    onSwitch: () => {
      leaveProfile()
      navigate('/profiles')
    },
  }
}

/** The page most recently colored and not finished; else where the child last read; else the first page. */
function pickResume(all: Pick[], artworks: Artwork[], lastBook?: string, lastIndex?: number): (Pick & { started: boolean }) | null {
  const recent = [...artworks].filter((a) => !a.completedAt && a.progress > 0).sort((a, b) => b.updatedAt - a.updatedAt)[0]
  const fromArt = recent ? all.find((p) => p.book.id === recent.bookId && p.page.id === recent.pageId) : undefined
  if (fromArt) return { ...fromArt, started: true }
  const inBook = all.filter((p) => p.book.id === lastBook)
  const atPage = inBook.find((p) => lastIndex !== undefined && p.book.pages.indexOf(p.page) === lastIndex && p.state.status !== 'done')
  // Nothing left to color: no "keep coloring" card (Home shows the "all done" note instead).
  const pick = atPage ?? inBook.find((p) => p.state.status !== 'done') ?? all.find((p) => p.state.status !== 'done')
  return pick ? { ...pick, started: pick.state.status === 'progress' } : null
}

const FENCE_SPOTS = [
  { x: 430, y: 746, tilt: -3 },
  { x: 568, y: 742, tilt: 2 },
  { x: 706, y: 748, tilt: -2 },
]

function HomePins(d: HomeData) {
  const { layout } = useSceneLayout()
  if (layout !== 'scene') return null
  return (
    <>
      <ScenePin x={50} y={48} w={350}>
        <Greeting {...d} />
      </ScenePin>

      {d.resume ? (
        <ScenePin x={436} y={170} w={496} h={502}>
          <ResumeCard pick={d.resume} colorUrl={d.thumbs.get(`${d.resume.book.id}:${d.resume.page.id}`)} />
        </ScenePin>
      ) : d.allDone ? (
        <ScenePin x={476} y={230} w={420}>
          <AllDone />
        </ScenePin>
      ) : null}

      <NewStickers profileId={d.profile?.id} stickers={d.stickers} pinned />

      {d.stats ? (
        <ScenePin x={1046} y={344} w={300}>
          <WeekCard stats={d.stats} color={d.profile ? crayonHex(d.profile.color) : 'var(--ll-sky)'} />
        </ScenePin>
      ) : null}

      {/* The Bookshop itself is a doorway to the library; the words sit on the painted signs */}
      <ScenePin x={0} y={452} w={206} h={290}>
        <Link to="/library" aria-label="Bookshop, go to the Library" className="block size-full rounded-3xl" />
      </ScenePin>
      <ScenePin x={331} y={436} w={100} h={44}>
        <SignLabel to="/library" className="size-full">Library</SignLabel>
      </ScenePin>
      <ScenePin x={246} y={509} w={84} h={46}>
        <SignLabel to="/gallery" className="size-full">My art</SignLabel>
      </ScenePin>
      <ScenePin x={304} y={672} w={94} h={46}>
        <SignLabel to="/stickers" className="size-full">Stickers</SignLabel>
      </ScenePin>

      <section aria-labelledby="fence-h" className="pointer-events-none inset-0">
        <ScenePin x={278} y={786} w={140} h={90}>
          <PaperCard flat tilt={-2} className="grid size-full place-items-center">
            <h2 id="fence-h" className="text-center font-display text-[26px] leading-[1.1] font-semibold text-ink-deep">
              Pages to color
            </h2>
          </PaperCard>
        </ScenePin>
        {d.fence.map((p, i) => (
          <ScenePin key={`${p.book.id}:${p.page.id}`} x={FENCE_SPOTS[i].x} y={FENCE_SPOTS[i].y} w={124} h={158}>
            <PaperPage book={p.book} page={p.page} state={p.state} colorUrl={d.thumbs.get(`${p.book.id}:${p.page.id}`)} tilt={FENCE_SPOTS[i].tilt} stickerSize={52} className="size-full" />
          </ScenePin>
        ))}
        <ScenePin x={430 + d.fence.length * 138} y={744} w={124} h={158}>
          <MoreTile to="/library" tilt={3} className="size-full text-[24px] leading-[1.15]">
            <span>
              All
              <br />
              pages
            </span>
          </MoreTile>
        </ScenePin>
      </section>

      <TabBar variant="pins" />
    </>
  )
}

function Greeting({ profile, resume, allDone, onSwitch, compact }: HomeData & { compact?: boolean }) {
  return (
    <div className="relative">
      <Tape variant="kraft" className="-top-3 left-24 -rotate-3" />
      <PaperCard className={compact ? 'flex items-center gap-4 px-5 py-4' : 'flex flex-col gap-[18px] px-7 py-[30px]'}>
        <div className="flex items-center gap-5">
          {profile ? (
            <button
              type="button"
              onClick={onSwitch}
              aria-label={`Switch profile (now ${profile.name})`}
              title="Switch profile"
              className={compact ? 'size-16 shrink-0 rounded-full' : 'size-[124px] shrink-0 rounded-full transition-transform hover:-rotate-3'}
            >
              <Avatar avatar={profile.avatar} color={profile.color} size="fill" />
            </button>
          ) : null}
          <h1 className={compact ? 'font-display text-[2rem] leading-none font-semibold text-ink-deep' : 'font-display text-[54px] leading-none font-semibold text-ink-deep'}>
            Hi {profile?.name ?? 'there'}!
          </h1>
        </div>
        {compact ? null : (
          <p className="text-center text-[29px] leading-[1.25] font-bold text-ink-deep">
            {resume?.started ? 'Your book is right where you left it.' : allDone ? 'You colored every page!' : 'Pick a page and start coloring.'}
          </p>
        )}
      </PaperCard>
    </div>
  )
}

function ResumeCard({ pick, colorUrl, compact }: { pick: Pick & { started: boolean }; colorUrl?: string; compact?: boolean }) {
  const { book, page, state, started } = pick
  const label = started ? 'Keep coloring' : 'Start coloring'
  return (
    <section aria-labelledby="resume-h" className={compact ? 'relative' : 'relative size-full pt-[14px]'} style={{ ['--acc' as string]: 'var(--ll-cran)', ['--acc-dk' as string]: 'var(--ll-cran-dk)', ['--on-acc' as string]: '#fff' } as CSSProperties}>
      <Tape variant="kraft" className="top-0 left-1/2 !w-40 -translate-x-1/2 rotate-2" />
      <PaperCard className={compact ? 'p-5' : 'relative size-full'}>
        <div className={compact ? 'flex gap-4' : ''}>
          <Link
            to={`/books/${book.id}`}
            aria-label={`${book.title} book`}
            className={compact ? 'block w-28 shrink-0 -rotate-2' : 'absolute top-8 left-[30px] block w-[192px] -rotate-2'}
          >
            <BookCover book={book} eager />
          </Link>
          <div className={compact ? 'relative w-32 rotate-2' : 'absolute top-[26px] left-[238px] w-[226px] rotate-[2.5deg]'}>
            <PaperCard flat className="bg-[#fffdf8] p-[9px]">
              <PagePreview page={page} colorUrl={colorUrl} className="[&>img]:object-top" />
            </PaperCard>
            {state.status !== 'new' ? (
              <span className="ll-sticker ll-sticker-progress !absolute -top-3.5 -right-3" style={{ ['--d' as string]: compact ? '44px' : '56px' }}>
                {state.sticker}
              </span>
            ) : null}
          </div>
        </div>
        <h2 id="resume-h" className={compact ? 'mt-4 font-display text-[1.5rem] leading-tight font-semibold text-ink-deep' : 'absolute top-[334px] left-[34px] right-[30px] truncate font-display text-[36px] leading-none font-semibold text-ink-deep'}>
          {page.title}
        </h2>
        <div className={compact ? 'mt-3 flex flex-wrap items-center justify-between gap-4' : ''}>
          <div className={compact ? 'flex w-40 flex-col gap-2' : 'absolute top-[396px] left-[34px] flex w-[178px] flex-col gap-2.5'}>
            <span className={compact ? 'text-[1.0625rem] font-bold text-ink-deep' : 'text-[24px] leading-none font-bold text-ink-deep'}>
              {started ? `${state.pct}% colored` : book.title}
            </span>
            {started ? <CrayonProgress label={`${page.title} colored`} value={state.pct} color="var(--ll-sky-dk)" /> : null}
          </div>
          <ClayLink
            to={`/color/${book.id}/${page.id}`}
            size="sm"
            className={compact ? '' : '!absolute top-[388px] right-[30px] !h-[66px] !text-[28px]'}
          >
            {label}
          </ClayLink>
        </div>
      </PaperCard>
    </section>
  )
}

const narrowDay = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long' })

function WeekCard({ stats, color, compact }: { stats: ProfileStats; color: string; compact?: boolean }) {
  const max = Math.max(1, ...stats.week.map((d) => d.ms))
  const mins = (ms: number) => Math.round(ms / 60000)
  const summary = stats.week.map((d) => `${longDay.format(d.date)} ${mins(d.ms)} minutes`).join(', ')
  const last = stats.week.length - 1
  return (
    <section aria-labelledby="week-h" className="relative">
      <Tape variant="kraft" className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
      <PaperCard className={compact ? 'flex flex-col items-center px-6 pt-5 pb-5' : 'flex flex-col items-center px-[26px] pt-5 pb-5'}>
        <h2 id="week-h" className={compact ? 'font-display text-[1.75rem] leading-none font-semibold text-ink-deep' : 'font-display text-[40px] leading-none font-semibold text-ink-deep'}>
          Your week
        </h2>
        <p className={compact ? 'mt-1 text-[0.9375rem] font-semibold text-graphite' : 'mt-1.5 text-[18px] font-semibold text-graphite'}>Minutes of coloring</p>
        <div role="img" aria-label={summary} className="mt-3 grid h-[84px] w-[238px] grid-cols-7 items-end gap-x-2">
          {stats.week.map((d, i) => (
            <div
              key={d.key}
              className="rounded-t-lg rounded-b-sm"
              style={{
                height: d.ms > 0 ? `${Math.max(12, (d.ms / max) * 100)}%` : 6,
                background: d.ms > 0 ? color : 'var(--color-mist)',
                boxShadow: i === last ? '0 0 0 3px #fffdf8, 0 0 0 5px var(--ll-honey)' : 'inset 0 3px 1px rgb(255 255 255 / 0.35)',
              }}
            />
          ))}
        </div>
        <div aria-hidden className="mt-2 grid w-[238px] grid-cols-7 gap-x-2 text-center font-display text-[20px] leading-none font-semibold text-ink-deep">
          {stats.week.map((d, i) => (
            <span key={d.key} className={i === last ? 'text-rust' : ''}>
              {narrowDay.format(d.date)}
            </span>
          ))}
        </div>
        <p className={compact ? 'mt-3 flex items-center gap-2 text-[1.0625rem] font-bold text-ink-deep' : 'mt-3 flex items-center gap-2.5 text-[24px] leading-none font-bold text-ink-deep'}>
          <Flame className={compact ? 'size-5 text-rust' : 'size-7 text-rust'} fill="currentColor" aria-hidden />
          {stats.streak > 0 ? `${stats.streak}-day streak` : 'Color today to start a streak'}
        </p>
      </PaperCard>
    </section>
  )
}

/** A note pinned up for stickers earned since the child last looked. */
function NewStickers({ profileId, stickers, pinned }: { profileId?: string; stickers: StickerState[]; pinned?: boolean }) {
  const seen = usePrefs((s) => (profileId ? s.seenStickers[profileId] : undefined)) ?? []
  const markSeen = usePrefs((s) => s.markStickersSeen)
  const fresh = stickers.filter((s) => s.earned && !seen.includes(s.id))
  if (!profileId || fresh.length === 0) return null
  const card = (
    <div className="relative">
      <Tape variant="rainbow" className="-top-3 left-1/2 -translate-x-1/2 rotate-2" />
      <PaperCard role="status" className="flex flex-col items-center gap-3 px-5 py-5 text-center">
        <ul className="flex -space-x-3">
          {fresh.slice(0, 3).map((s) => (
            <li key={s.id}>
              <StickerBadge sticker={s} size="sm" showText={false} />
            </li>
          ))}
        </ul>
        <p className={pinned ? 'font-display text-[24px] leading-tight font-semibold text-ink-deep' : 'font-display text-[1.25rem] leading-tight font-semibold text-ink-deep'}>
          {fresh.length === 1 ? 'You got a new sticker!' : `You got ${fresh.length} new stickers!`}
        </p>
        <ClayButton tone="honey" size="sm" onClick={() => markSeen(profileId, fresh.map((s) => s.id))}>
          <PartyPopper className="size-5" /> Yay!
        </ClayButton>
      </PaperCard>
    </div>
  )
  if (!pinned) return card
  return (
    <ScenePin x={1046} y={40} w={300}>
      {card}
    </ScenePin>
  )
}

/** Phones and small windows: the village as a picture band, then the same cards stacked. */
function HomeStacked(d: HomeData) {
  const { layout } = useSceneLayout()
  if (layout !== 'band') return null
  return (
    <div className={`-mt-8 flex flex-col items-center gap-8 px-4 ${TAB_BAR_SPACE}`}>
      <div className="w-full max-w-xl">
        <Greeting {...d} compact />
      </div>
      <div className="w-full max-w-xl">
        <NewStickers profileId={d.profile?.id} stickers={d.stickers} />
      </div>
      {d.resume ? (
        <div className="w-full max-w-xl">
          <ResumeCard pick={d.resume} colorUrl={d.thumbs.get(`${d.resume.book.id}:${d.resume.page.id}`)} compact />
        </div>
      ) : d.allDone ? (
        <div className="w-full max-w-xl">
          <AllDone compact />
        </div>
      ) : null}
      {d.stats ? (
        <div className="w-full max-w-xl">
          <WeekCard stats={d.stats} color={d.profile ? crayonHex(d.profile.color) : 'var(--ll-sky)'} compact />
        </div>
      ) : null}
      <section aria-labelledby="fence-h-s" className="w-full max-w-xl">
        <h2 id="fence-h-s" className="font-display text-[1.75rem] font-semibold text-ink-deep">
          Pages to color
        </h2>
        <ul className="mt-5 grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-4">
          {d.fence.map((p, i) => (
            <li key={`${p.book.id}:${p.page.id}`}>
              <PaperPage book={p.book} page={p.page} state={p.state} colorUrl={d.thumbs.get(`${p.book.id}:${p.page.id}`)} tilt={FENCE_SPOTS[i].tilt / 2} stickerSize={48} className="aspect-[124/158] w-full" />
            </li>
          ))}
          <li>
            <MoreTile to="/library" className="aspect-[124/158] w-full text-[1.25rem]">
              All pages
            </MoreTile>
          </li>
        </ul>
      </section>
      <TabBar variant="fixed" />
    </div>
  )
}

/** Every page is finished: say so, and point to the fridge and the library. */
function AllDone({ compact }: { compact?: boolean }) {
  return (
    <section aria-labelledby="done-h" className="relative">
      <Tape variant="rainbow" className="-top-3 left-1/2 -translate-x-1/2 rotate-2" />
      <PaperCard className={compact ? 'flex flex-col items-center px-6 py-6 text-center' : 'flex flex-col items-center px-8 py-9 text-center'}>
        <h2 id="done-h" className={compact ? 'font-display text-[1.75rem] leading-tight font-semibold text-ink-deep' : 'font-display text-[40px] leading-tight font-semibold text-ink-deep'}>
          Every page is colored!
        </h2>
        <p className={compact ? 'mt-2 font-bold text-graphite' : 'mt-3 text-[22px] leading-snug font-bold text-graphite'}>
          See them all on the fridge, or color a favorite again.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <ClayLink to="/gallery" tone="pine" size="sm">
            My art
          </ClayLink>
          <ClayLink to="/library" tone="cream" size="sm">
            Library
          </ClayLink>
        </div>
      </PaperCard>
    </section>
  )
}
