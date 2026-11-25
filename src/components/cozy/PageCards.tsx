import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router'
import type { Book, BookPage } from '../../content/books'
import type { Artwork } from '../../data/types'
import { PagePreview } from '../BookCard'
import { cn } from '../ui'
import { StatusSticker, Tape, type TapeVariant } from './index'

export type PageStatus = 'done' | 'progress' | 'new'

export interface PageState {
  status: PageStatus
  /** 0–100, how much is colored. */
  pct: number
  /** What the sticker says: "Done!", "45%" or "New". */
  sticker: string
  /** For screen readers: "finished", "45% colored", "not started". */
  note: string
}

/** Where one child is with one page. */
export function pageState(art: Artwork | undefined): PageState {
  if (art?.completedAt) return { status: 'done', pct: 100, sticker: 'Done!', note: 'finished' }
  const pct = Math.round(Math.min(1, Math.max(0, art?.progress ?? 0)) * 100)
  if (pct > 0) return { status: 'progress', pct, sticker: `${pct}%`, note: `${pct}% colored` }
  return { status: 'new', pct: 0, sticker: 'New', note: 'not started' }
}

/** A page's accessible name: its title, then what its sticker says ("New", "45% colored", "Done!"). */
export function pageLabel(title: string, state: PageState): string {
  return `${title}, ${state.status === 'progress' ? `${state.pct}% colored` : state.sticker}`
}

/** Looks up a child's artwork for a page. */
export function artworkIndex(artworks: Artwork[]) {
  const map = new Map(artworks.map((a) => [`${a.bookId}:${a.pageId}`, a]))
  return (book: Book, page: BookPage) => map.get(`${book.id}:${page.id}`)
}

/**
 * A page printed on paper with its status sticker, as it sits on the fence, a shelf or the desk edge.
 * Opens the page in the coloring studio unless `to` says otherwise.
 */
export function PaperPage({
  book,
  page,
  state,
  colorUrl,
  to,
  tilt = 0,
  tape,
  stickerSize = 56,
  className,
  style,
}: {
  book: Book
  page: BookPage
  state: PageState
  colorUrl?: string
  to?: string
  tilt?: number
  tape?: TapeVariant
  stickerSize?: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <Link
      to={to ?? `/color/${book.id}/${page.id}`}
      aria-label={pageLabel(page.title, state)}
      className={cn('ll-paper ll-paper-flat ll-page-card group block', className)}
      style={{ ['--r' as string]: `${tilt}deg`, ...style }}
    >
      <PagePreview page={page} colorUrl={colorUrl} className="h-full w-full rounded-[3px] [&>img]:object-top" />
      {tape ? <Tape variant={tape} className="!h-[30px] !w-[48%] -top-4 left-1/2 -translate-x-1/2" /> : null}
      <StatusSticker status={state.status} size={stickerSize} className="!absolute -top-4 -right-3">
        {state.sticker}
      </StatusSticker>
    </Link>
  )
}

/** A dashed "more" tile in the same size as the pages around it. */
export function MoreTile({ to, tilt = 0, className, style, children }: { to: string; tilt?: number; className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn('ll-paper ll-paper-flat ll-page-card grid place-items-center border-[3px] border-dashed border-[#cdb68f] text-center font-display font-semibold text-ink-deep', className)}
      style={{ ['--r' as string]: `${tilt}deg`, ...style }}
    >
      {children}
    </Link>
  )
}
