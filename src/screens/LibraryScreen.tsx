import { Search } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { BookCard } from '../components/BookCard'
import { cn } from '../components/ui'
import { bookProgress, type BookStatus } from '../data/progress'
import { useProfileArtworks } from '../state/hooks'
import { useBooks } from '../state/library-store'
import { useTitle } from '../lib/useTitle'

const STATUSES: Array<{ id: BookStatus | 'all'; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'new', label: 'Not started' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
]

export function LibraryScreen() {
  const artworks = useProfileArtworks() ?? []
  useTitle('Library')
  const books = useBooks()
  const allTags = useMemo(() => Array.from(new Set(books.flatMap((b) => b.tags))).sort(), [books])
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [status, setStatus] = useState<BookStatus | 'all'>('all')

  const shelf = useMemo(() => books.map((book) => ({ book, progress: bookProgress(book, artworks) })), [books, artworks])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return shelf.filter(({ book, progress }) => {
      if (tag && !book.tags.includes(tag)) return false
      if (status !== 'all' && progress.status !== status) return false
      if (!q) return true
      return (
        book.title.toLowerCase().includes(q) ||
        book.tags.some((t) => t.toLowerCase().includes(q)) ||
        book.pages.some((p) => p.title.toLowerCase().includes(q))
      )
    })
  }, [shelf, query, tag, status])

  const filtered = Boolean(query.trim() || tag || status !== 'all')

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-title font-extrabold text-ink-deep">Library</h1>
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search books and pages</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-graphite" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search books and pages"
            className="min-h-12 w-full rounded-full bg-paper pr-4 pl-12 ring-2 ring-inset ring-mist outline-none focus:ring-sky"
          />
        </label>
      </div>

      <div className="mt-6 flex flex-col gap-3">
        <div role="radiogroup" aria-label="Show books" className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <Chip key={s.id} active={status === s.id} onClick={() => setStatus(s.id)} role="radio">
              {s.label}
            </Chip>
          ))}
        </div>
        <div role="group" aria-label="Topics" className="flex flex-wrap gap-2">
          {allTags.map((t) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)} variant="tag">
              {t}
            </Chip>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="mt-12 max-w-md">
          <p className="text-graphite">
            {query.trim() ? `No books or pages match “${query.trim()}”.` : 'No books match these filters.'}
          </p>
          {filtered ? (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                setTag(null)
                setStatus('all')
              }}
              className="mt-3 font-semibold text-ink underline decoration-[var(--crayon)] decoration-[3px] underline-offset-4"
            >
              Show all books
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
          {shown.map(({ book, progress }) => (
            <li key={book.id}>
              <BookCard book={book} progress={progress} />
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

function Chip({
  active,
  onClick,
  children,
  role,
  variant = 'status',
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  role?: 'radio'
  variant?: 'status' | 'tag'
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'radio' ? active : undefined}
      aria-pressed={role ? undefined : active}
      onClick={onClick}
      className={cn(
        'min-h-11 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors',
        active
          ? variant === 'status'
            ? 'bg-ink text-white'
            : 'bg-[color-mix(in_srgb,var(--crayon)_22%,white)] text-ink-deep ring-2 ring-inset ring-[var(--crayon)]'
          : 'bg-paper text-ink ring-2 ring-inset ring-mist hover:ring-ink/30',
      )}
    >
      {variant === 'tag' ? `#${children}` : children}
    </button>
  )
}
