import { Check } from 'lucide-react'
import { Link } from 'react-router'
import type { Book, BookPage } from '../content/books'
import { progressLabel, type BookProgress } from '../data/progress'
import { BookCover } from './BookCover'
import { cn } from './ui'

/** A book on the shelf: cover, title, and how far this child has got. */
export function BookCard({ book, progress, eager }: { book: Book; progress: BookProgress; eager?: boolean }) {
  return (
    <Link to={`/books/${book.id}`} className="group block rounded-md">
      <span className="relative block">
        <BookCover
          book={book}
          eager={eager}
          className="transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98]"
        />
        {progress.status === 'finished' ? (
          <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-meadow px-2.5 py-1 text-[0.8125rem] font-bold text-white shadow-lift">
            <Check className="size-4" strokeWidth={3} /> Finished
          </span>
        ) : null}
      </span>
      <span className="mt-3 block font-semibold text-ink-deep">{book.title}</span>
      <span className="block text-[0.9375rem] text-graphite">{progressLabel(progress)}</span>
      {progress.status !== 'new' ? <ProgressBar value={progress.fraction} className="mt-2" /> : null}
    </Link>
  )
}

export function ProgressBar({ value, className, tone = 'var(--crayon, var(--color-ink))' }: { value: number; className?: string; tone?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100)
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label="Book progress"
      className={cn('block h-2 overflow-hidden rounded-full bg-mist', className)}
    >
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, backgroundColor: tone }} />
    </span>
  )
}

/**
 * A line-art page on paper with the child's coloring under it. The line-art
 * thumbnail is black on white, so it is multiplied over the color layer.
 */
export function PagePreview({ page, colorUrl, className }: { page: BookPage; colorUrl?: string; className?: string }) {
  return (
    <span className={cn('relative block aspect-[210/297] overflow-hidden rounded-[4px] bg-paper', className)}>
      {colorUrl ? <img src={colorUrl} alt="" className="absolute inset-0 size-full" draggable={false} /> : null}
      <img
        src={page.thumb}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn('absolute inset-0 size-full object-cover', colorUrl && 'mix-blend-multiply')}
      />
    </span>
  )
}

/** A page tile. Tapping it opens the page for coloring. */
export function PageTile({
  book,
  page,
  label,
  colorUrl,
  done,
}: {
  book: Book
  page: BookPage
  label?: string
  colorUrl?: string
  done?: boolean
}) {
  return (
    <Link to={`/color/${book.id}/${page.id}`} className="group block rounded-md">
      <span className="relative block">
        <PagePreview
          page={page}
          colorUrl={colorUrl}
          className="shadow-paper transition-transform duration-200 group-hover:-translate-y-1 group-active:scale-[0.98]"
        />
        {done ? (
          <span className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-meadow text-white shadow-lift">
            <Check className="size-5" strokeWidth={3} aria-label="Finished" />
          </span>
        ) : null}
      </span>
      <span className="mt-3 block font-semibold text-ink-deep">
        {label ? <span className="text-graphite">{label}: </span> : null}
        {page.title}
      </span>
    </Link>
  )
}
