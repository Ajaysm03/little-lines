import { AlertTriangle, ChevronDown, ChevronUp, FileUp, GripVertical } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link } from 'react-router'
import { Button, ButtonLink, cn, Spinner } from '../components/ui'
import { api, type CatalogBook } from '../data/api'
import { useTitle } from '../lib/useTitle'
import { useLibrary } from '../state/library-store'
import { AdminHeader } from './AdminLayout'
import { NewChip, StatusChip, TierChip } from './BookChips'
import { bookRows, bundledTitles, type AdminBookRow } from './books-data'
import { formatDate } from './format'

const FILTERS = [
  { id: 'all', label: 'In the library' },
  { id: 'draft', label: 'Drafts' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
] as const
type FilterId = (typeof FILTERS)[number]['id']

export function AdminBooks() {
  useTitle('Books')
  const [books, setBooks] = useState<CatalogBook[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterId>('all')
  const [order, setOrder] = useState<string[] | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [dragId, setDragId] = useState<string | null>(null)
  const refreshLibrary = useLibrary((s) => s.refreshCatalog)

  const load = useCallback(async () => {
    setError(null)
    try {
      setBooks((await api.adminBooks()).books)
      setOrder(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t load the books.')
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => (books ? bookRows(books) : []), [books])
  // Drafts and published books share one order (a draft keeps its place when published); archived books are left out.
  const ordered = useMemo(() => {
    const active = rows.filter((r) => r.status !== 'archived')
    if (!order) return active
    const byId = new Map(active.map((r) => [r.id, r]))
    return order.map((id) => byId.get(id)).filter((r): r is AdminBookRow => !!r)
  }, [rows, order])
  const counts = {
    all: rows.filter((r) => r.status !== 'archived').length,
    draft: rows.filter((r) => r.status === 'draft').length,
    published: rows.filter((r) => r.status === 'published').length,
    archived: rows.filter((r) => r.status === 'archived').length,
  }
  const shown = filter === 'all' ? ordered : rows.filter((r) => r.status === filter)
  const canReorder = filter === 'all'

  async function saveOrder(ids: string[]) {
    setOrder(ids)
    setSaving('saving')
    try {
      await api.adminBookOrder(ids, bundledTitles())
      setSaving('saved')
      void refreshLibrary()
    } catch {
      setSaving('error')
    }
  }

  function move(id: string, by: number) {
    const ids = ordered.map((r) => r.id)
    const from = ids.indexOf(id)
    const to = from + by
    if (from < 0 || to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    void saveOrder(ids)
  }

  function onDrop(targetId: string) {
    if (!dragId || dragId === targetId) return setDragId(null)
    const ids = ordered.map((r) => r.id)
    const from = ids.indexOf(dragId)
    ids.splice(from, 1)
    ids.splice(ids.indexOf(targetId) + (from <= ids.indexOf(targetId) ? 1 : 0), 0, dragId)
    setDragId(null)
    void saveOrder(ids)
  }

  return (
    <>
      <AdminHeader
        title="Books"
        intro="Every book families can see, in library order. Upload a PDF to make a new draft; publish it when it’s ready."
        actions={
          <ButtonLink to="/admin/books/new">
            <FileUp className="size-5" /> Upload a PDF
          </ButtonLink>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'min-h-10 rounded-full px-4 text-[0.9375rem] font-semibold transition-colors',
                filter === f.id ? 'bg-ink text-white' : 'bg-paper text-ink ring-1 ring-mist hover:ring-ink/40',
              )}
            >
              {f.label} <span className={cn('ml-1 tabular-nums', filter === f.id ? 'text-white/75' : 'text-graphite')}>{counts[f.id]}</span>
            </button>
          ))}
        </div>
        <p className="ml-auto text-[0.9375rem] text-graphite" role="status">
          {saving === 'saving' ? 'Saving the order…' : saving === 'saved' ? 'Order saved' : saving === 'error' ? 'Couldn’t save the order. Try again.' : ''}
        </p>
      </div>

      <div className="mt-5 overflow-hidden rounded-3xl bg-paper ring-1 ring-mist">
        {error ? (
          <div className="px-6 py-8" role="alert">
            <p className="font-semibold text-ink-deep">Couldn’t load the books.</p>
            <p className="mt-1 text-graphite">{error}</p>
            <Button variant="secondary" className="mt-4" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        ) : !books ? (
          <p className="flex items-center gap-3 px-6 py-8 text-graphite" role="status">
            <Spinner className="size-5" /> Loading books…
          </p>
        ) : shown.length === 0 ? (
          <p className="px-6 py-8 text-graphite">
            {filter === 'draft' ? 'No drafts. Upload a PDF to start one.' : filter === 'archived' ? 'Nothing archived.' : 'No books yet.'}
          </p>
        ) : (
          <ol className="divide-y divide-frost">
            {shown.map((r, i) => (
              <li
                key={r.id}
                onDragOver={canReorder ? (e: DragEvent) => e.preventDefault() : undefined}
                onDrop={canReorder ? () => onDrop(r.id) : undefined}
                className={cn('flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-5', dragId === r.id && 'opacity-40')}
              >
                {canReorder ? (
                  <span className="flex shrink-0 items-center">
                    <span
                      draggable
                      onDragStart={() => setDragId(r.id)}
                      onDragEnd={() => setDragId(null)}
                      className="hidden cursor-grab touch-none rounded-lg p-1.5 text-graphite hover:bg-frost active:cursor-grabbing sm:block"
                      title="Drag to reorder"
                      aria-hidden
                    >
                      <GripVertical className="size-5" />
                    </span>
                    <span className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => move(r.id, -1)}
                        disabled={i === 0 || saving === 'saving'}
                        aria-label={`Move ${r.title} up`}
                        className="grid size-8 place-items-center rounded-lg text-graphite hover:bg-frost disabled:opacity-30"
                      >
                        <ChevronUp className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(r.id, 1)}
                        disabled={i === shown.length - 1 || saving === 'saving'}
                        aria-label={`Move ${r.title} down`}
                        className="grid size-8 place-items-center rounded-lg text-graphite hover:bg-frost disabled:opacity-30"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </span>
                  </span>
                ) : null}
                <BookRow row={r} />
              </li>
            ))}
          </ol>
        )}
      </div>
      {canReorder && shown.length > 1 ? (
        <p className="mt-3 text-[0.875rem] text-graphite">Families see published books in this order. Drag a book, or use the arrows.</p>
      ) : null}
    </>
  )
}

function BookRow({ row: r }: { row: AdminBookRow }) {
  return (
    <Link to={`/admin/books/${r.id}`} className="group flex min-w-0 flex-1 items-center gap-4 rounded-xl py-1 pr-2">
      {r.coverThumb ? (
        <img src={r.coverThumb} alt="" loading="lazy" className="w-11 shrink-0 rounded-[2px_4px_4px_2px] bg-frost shadow-book" style={{ aspectRatio: '210 / 297' }} />
      ) : (
        <span className="w-11 shrink-0 rounded-[2px_4px_4px_2px] bg-frost" style={{ aspectRatio: '210 / 297' }} />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-semibold text-ink-deep group-hover:underline">{r.title}</span>
          <StatusChip status={r.status} bundled={r.origin === 'bundled'} />
          <TierChip tier={r.tier} />
          {r.isNew ? <NewChip /> : null}
        </span>
        <span className="mt-0.5 block text-[0.9375rem] text-graphite">
          {r.pagesToColor} {r.pagesToColor === 1 ? 'page' : 'pages'} to color, {r.category}
          {r.origin === 'family-import' ? ', imported by a family' : ''}
          {r.publishedAt && r.status === 'published' ? `, published ${formatDate(r.publishedAt)}` : ''}
        </span>
        {r.missingImages ? (
          <span className="mt-1 flex items-center gap-1.5 text-[0.875rem] text-error">
            <AlertTriangle className="size-4" /> {r.missingImages} page {r.missingImages === 1 ? 'image is' : 'images are'} missing
          </span>
        ) : null}
      </span>
    </Link>
  )
}
