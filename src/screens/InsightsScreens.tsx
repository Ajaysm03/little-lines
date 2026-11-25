import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { useParams } from 'react-router'
import { Avatar } from '../components/Avatar'
import { PagePreview } from '../components/BookCard'
import { CrayonProgress, PaperCard } from '../components/cozy'
import { GrownupsFrame } from '../components/cozy/GrownupsFrame'
import { cn } from '../components/ui'
import { FavoriteColors, WeekPanel } from '../components/insights'
import { CRAYONS, crayonHex } from '../content/profile-options'
import { formatDuration } from '../data/analytics'
import { db } from '../data/db'
import { bookProgress, progressLabel } from '../data/progress'
import { useArtworkThumbs, useProfileInsights } from '../state/hooks'
import { getBook, useBooks } from '../state/library-store'
import { useTitle } from '../lib/useTitle'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'

const crayonLabel = (id: string) => CRAYONS.find((c) => c.id === id)?.label ?? 'Sky'

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

function Box({ title, children, aside, className }: { title: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  const id = `box-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`
  return (
    <section aria-labelledby={id} className={cn('rounded-[20px] bg-[#f3e8d3] px-5 py-5 shadow-[inset_0_2px_6px_rgb(90_60_30/0.15)]', className)}>
      <div className="flex items-baseline justify-between gap-4">
        <h2 id={id} className="font-display text-[1.5rem] leading-tight font-semibold text-ink-deep">
          {title}
        </h2>
        {aside}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** A labelled number on a little paper tile. */
function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl bg-[#fffdf8] px-3 py-3 text-center shadow-[0_2px_0_rgb(120_90_50/0.12)]">
      <dt className="mt-0.5 text-[0.875rem] font-bold text-graphite">{label}</dt>
      <dd className="font-display text-[1.5rem] leading-tight font-semibold text-ink-deep">{value}</dd>
    </div>
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
    <GrownupsFrame back={{ to: '/grown-ups', label: 'Grown-ups' }} width="max-w-[80rem]">
      <PaperCard className="px-5 pt-7 pb-8 sm:px-9">
      <header className="flex items-center gap-5">
        <Avatar avatar={profile.avatar} color={profile.color} size="md" className="!size-[4.5rem]" />
        <div>
          <h1 className="font-display text-[2.75rem] leading-none font-semibold text-ink">{profile.name}</h1>
          <p className="mt-1.5 font-bold text-graphite">
            Favorite crayon: {crayonLabel(profile.color)} · Last colored: {lastActive}
          </p>
        </div>
      </header>
      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">

      <Box title="This week">
        <WeekPanel stats={stats} color={color} you={false} />
      </Box>

      <Box title="All time">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Figure label="Time coloring" value={formatDuration(stats.totalMs)} />
          <Figure label="Coloring sessions" value={String(stats.sessions)} />
          <Figure label="Average session" value={formatDuration(stats.avgSessionMs)} />
          <Figure label="Best streak" value={stats.bestStreak === 1 ? '1 day' : `${stats.bestStreak} days`} />
          <Figure label="Pages finished" value={String(stats.pagesFinished)} />
          <Figure label="Pages in progress" value={String(stats.pagesStarted)} />
          <Figure label="Strokes and fills" value={(stats.strokes + stats.fills).toLocaleString()} />
          <Figure label="Different colors" value={String(stats.distinctColors)} />
        </dl>
      </Box>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <Box title="Books">
        <ul className="flex flex-col gap-4">
          {books.map((book) => {
            const p = bookProgress(book, artworks)
            return (
              <li key={book.id} className="flex items-center gap-4">
                <img src={book.coverThumb} alt="" className="w-12 rounded-[2px_4px_4px_2px] shadow-book" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-deep">{book.title}</p>
                  <CrayonProgress label={`${book.title} progress`} value={Math.round(p.fraction * 100)} color={color} className="mt-2 !h-4" />
                  <p className="mt-1 text-[0.875rem] font-bold text-graphite">{progressLabel(p)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      </Box>

      {recent.length ? (
        <Box title="Recent pictures">
          <ul className="grid grid-cols-3 gap-3">
            {recent.map((a) => {
              const page = getBook(a.bookId)?.pages.find((p) => p.id === a.pageId)
              if (!page) return null
              return (
                <li key={a.id}>
                  <PagePreview page={page} colorUrl={thumbs.get(`${a.bookId}:${a.pageId}`)} className="bg-[#fffdf8] shadow-[0_4px_8px_-4px_rgb(60_35_15/0.5)]" />
                  <p className="mt-1.5 truncate text-[0.8125rem] font-bold text-graphite">
                    {page.title} · {a.completedAt ? 'done' : `${Math.round(a.progress * 100)}%`}
                  </p>
                </li>
              )
            })}
          </ul>
        </Box>
      ) : null}

      <Box title="Favorite colors and tools">
        {stats.favoriteColors.length ? <FavoriteColors stats={stats} /> : <p className="font-bold text-graphite">No coloring yet.</p>}
        {stats.tools.size ? (
          <ul className="mt-4 flex flex-wrap gap-2">
            {[...stats.tools].map((t) => (
              <li key={t} className="rounded-full bg-[#fffdf8] px-3 py-1 text-[0.875rem] font-bold text-ink-deep">
                {TOOL_NAMES[t] ?? t}
              </li>
            ))}
          </ul>
        ) : null}
      </Box>

      <Box title="Stickers" aside={<span className="font-bold text-graphite">{stickers.filter((s) => s.earned).length} of {stickers.length}</span>}>
        <ul className="grid grid-cols-3 gap-x-2 gap-y-3">
          {stickers.map((s) => (
            <li key={s.id} className="flex justify-center">
              <span className={cn('ll-sticker-disc', !s.earned && 'll-sticker-disc-locked')} style={{ ['--d' as string]: '52px', ['--s' as string]: s.color }} title={s.title}>
                <span aria-hidden className={s.earned ? '' : 'opacity-35'}>
                  {s.emoji}
                </span>
                <span className="sr-only">
                  {s.title}, {s.earned ? 'collected' : 'not yet'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Box>
      </div>
      </PaperCard>
    </GrownupsFrame>
  )
}
