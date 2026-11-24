import type { Book } from '../content/books'
import { cn } from './ui'

/** A book cover with a spine shadow and real-book proportions, not a flat card. */
export function BookCover({ book, className, eager }: { book: Book; className?: string; eager?: boolean }) {
  return (
    <span
      className={cn('relative block aspect-[210/297] overflow-hidden rounded-[3px_8px_8px_3px] bg-frost shadow-book', className)}
    >
      <img
        src={book.coverThumb}
        srcSet={`${book.coverThumb} 480w, ${book.cover} 1600w`}
        sizes="(min-width: 768px) 240px, 45vw"
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        className="size-full object-cover"
      />
      {/* Spine crease and page-edge highlight */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[7%]"
        style={{
          background:
            'linear-gradient(90deg, rgb(0 0 0 / 0.32), rgb(0 0 0 / 0.08) 45%, rgb(255 255 255 / 0.18) 60%, transparent)',
        }}
      />
      <span aria-hidden className="absolute inset-0 rounded-[inherit] ring-1 ring-inset ring-black/10" />
    </span>
  )
}
