import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { PagePreview, ProgressBar } from '../components/BookCard'
import { FavoriteColors, StreakDots, WeekPanel } from '../components/insights'
import { StickerBadge } from '../components/Sticker'
import { crayonHex } from '../content/profile-options'
import { formatDuration } from '../data/analytics'
import { db } from '../data/db'
import { bookProgress, progressLabel } from '../data/progress'
import type { Profile } from '../data/types'
import { useArtworkThumbs, useProfileInsights } from '../state/hooks'
import { getBook, useBooks } from '../state/library-store'
import { useTitle } from '../lib/useTitle'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'

const TOOL_NAMES: Record<string, string> = {
  crayon: 'Crayon',
  pencil: 'Colored pencil',
  marker: 'Marker',
  watercolor: 'Paint',
  glitter: 'Glitter',
  eraser: 'Eraser',
  fill: 'Fill',
  'fill-shade': 'Shade fill',
  'fill-rainbow': 'Rainbow fill',
}

function Page({ back, children }: { back: { to: string; label: string }; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col px-4 pt-6 pb-14 sm:px-8">
      <Link to={back.to} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 font-semibold text-ink hover:bg-frost">
        <ArrowLeft className="size-5" /> {back.label}
      </Link>
      {children}
    </div>
  )
}

function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-10">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-heading font-bold text-ink-deep">{title}</h2>
        {aside}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A labelled number in a definition list. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="py-3">
      <dt className="text-[0.9375rem] text-graphite">{label}</dt>
      <dd className="mt-0.5 font-display text-[1.5rem] font-bold text-ink-deep">{value}</dd>
    </div>
  )
}

// ── Grown-ups area: one row per child ────────────────────────────────────────

export function ChildSummaryRow({ profile }: { profile: Profile }) {
  const insights = useProfileInsights(profile.id)
  const s = insights?.stats
  return (
    <li>
      <Link to={`/grown-ups/children/${profile.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-frost/60">
        <Avatar avatar={profile.avatar} color={profile.color} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-deep">{profile.name}</p>
          {s ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.9375rem] text-graphite">
              <span>{formatDuration(s.weekMs)} this week</span>
              <span>{s.pagesFinished === 1 ? '1 page finished' : `${s.pagesFinished} pages finished`}</span>
              <span className="flex items-center gap-2">
                <StreakDots stats={s} color={crayonHex(profile.color)} />
                <span className="sr-only">{s.streak} day streak</span>
              </span>
            </div>
          ) : (
            <p className="text-[0.9375rem] text-graphite">Loading…</p>
          )}
        </div>
        <ChevronRight className="size-5 shrink-0 text-graphite" />
      </Link>
    </li>
  )
}

// ── One child, in detail ─────────────────────────────────────────────────────

export function ChildInsightsScreen() {
  const { id } = useParams()
  const accountId = useSession((s) => s.account?.id)
  const profile = useLiveQuery(() => (id ? db.profiles.get(id) : undefined), [id])
  const insights = useProfileInsights(id)
  const thumbs = useArtworkThumbs(insights?.artworks)
  const books = useBooks()
  useTitle(profile ? `${profile.name}’s coloring` : 'Insights')
  if (profile === undefined || insights === undefined) return <Splash />
  if (!profile || profile.accountId !== accountId) return <NotFound />

  const { stats, stickers, artworks } = insights
  const color = crayonHex(profile.color)
  const recent = [...artworks].filter((a) => a.progress > 0).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)
  const lastActive = stats.lastActive
    ? new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(stats.lastActive)
    : 'Not yet'

  return (
    <Page back={{ to: '/grown-ups', label: 'Grown-ups' }}>
      <header className="mt-6 flex items-center gap-4">
        <Avatar avatar={profile.avatar} color={profile.color} size="md" />
        <div>
          <h1 className="font-display text-title font-extrabold text-ink-deep">{profile.name}</h1>
          <p className="text-graphite">Last colored: {lastActive}</p>
        </div>
      </header>

      <Section title="This week">
        <WeekPanel stats={stats} color={color} you={false} />
      </Section>

      <Section title="All time">
        <dl className="grid grid-cols-2 gap-x-6 divide-frost sm:grid-cols-4">
          <Figure label="Time coloring" value={formatDuration(stats.totalMs)} />
          <Figure label="Coloring sessions" value={String(stats.sessions)} />
          <Figure label="Average session" value={formatDuration(stats.avgSessionMs)} />
          <Figure label="Best streak" value={stats.bestStreak === 1 ? '1 day' : `${stats.bestStreak} days`} />
          <Figure label="Pages finished" value={String(stats.pagesFinished)} />
          <Figure label="Pages in progress" value={String(stats.pagesStarted)} />
          <Figure label="Strokes and fills" value={(stats.strokes + stats.fills).toLocaleString()} />
          <Figure label="Different colors" value={String(stats.distinctColors)} />
        </dl>
      </Section>

      <Section title="Books">
        <ul className="flex flex-col gap-4">
          {books.map((book) => {
            const p = bookProgress(book, artworks)
            return (
              <li key={book.id} className="flex items-center gap-4">
                <img src={book.coverThumb} alt="" className="w-12 rounded-[2px_4px_4px_2px] shadow-book" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-deep">{book.title}</p>
                  <ProgressBar value={p.fraction} tone={color} className="mt-1.5 max-w-sm" />
                  <p className="mt-1 text-[0.875rem] text-graphite">{progressLabel(p)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </Section>

      {recent.length ? (
        <Section title="Recent pictures">
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-6">
            {recent.map((a) => {
              const page = getBook(a.bookId)?.pages.find((p) => p.id === a.pageId)
              if (!page) return null
              return (
                <li key={a.id}>
                  <PagePreview page={page} colorUrl={thumbs.get(`${a.bookId}:${a.pageId}`)} className="shadow-paper" />
                  <p className="mt-1.5 truncate text-[0.8125rem] text-graphite">{page.title}</p>
                </li>
              )
            })}
          </ul>
        </Section>
      ) : null}

      <Section title="Favorite colors and tools">
        {stats.favoriteColors.length ? <FavoriteColors stats={stats} /> : <p className="text-graphite">No coloring yet.</p>}
        {stats.tools.size ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {[...stats.tools].map((t) => (
              <li key={t} className="rounded-full bg-paper px-3 py-1 text-[0.875rem] font-semibold text-ink ring-2 ring-inset ring-mist">
                {TOOL_NAMES[t] ?? t}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Stickers" aside={<span className="text-graphite">{stickers.filter((s) => s.earned).length} of {stickers.length}</span>}>
        <ul className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-6">
          {stickers.map((s) => (
            <li key={s.id} className="flex justify-center">
              <StickerBadge sticker={s} size="sm" />
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  )
}
