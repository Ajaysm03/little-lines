import { AlertTriangle, Archive, ArrowLeft, ChevronDown, ChevronUp, Eye, ImageUp, RotateCcw, Send, Trash2, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Dialog } from '../components/Dialog'
import { Button, ButtonLink, cn, FormError, Spinner, TextField } from '../components/ui'
import { BUNDLED_BOOKS, type Book } from '../content/books'
import { api, ApiError, catalogImageUrl, type CatalogBook, type CatalogPage, type CatalogTier } from '../data/api'
import { extractPalette, themeFrom } from '../import/convert'
import { coverFromFile } from '../import/image'
import { useTitle } from '../lib/useTitle'
import { useLibrary } from '../state/library-store'
import { Panel } from './AdminLayout'
import { NewChip, StatusChip, TierChip } from './BookChips'
import { BookDetailsFields, CATEGORIES, detailsFromMeta, metaFromDetails, type Details } from './BookDetailsFields'
import { missingImages } from './books-data'
import { formatDate, formatWhen } from './format'
import { isNewBook } from '../content/books'

export function AdminBookEditor() {
  const { id = '' } = useParams()
  const bundled = BUNDLED_BOOKS.find((b) => b.id === id) ?? null
  const [book, setBook] = useState<CatalogBook | null | undefined>(undefined)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      setBook(await api.adminBook(id))
    } catch (err) {
      // A book that comes with the app has no catalog row until its settings are first changed.
      if (err instanceof ApiError && err.status === 404 && bundled) setBook(null)
      else setLoadError(err instanceof Error ? err.message : 'Couldn’t load the book.')
    }
  }, [id, bundled])
  useEffect(() => {
    void load()
  }, [load])

  useTitle(book?.meta?.title ?? bundled?.title ?? 'Book')

  if (loadError)
    return (
      <>
        <BackLink />
        <div className="mt-6 rounded-3xl bg-paper p-6 ring-1 ring-mist" role="alert">
          <p className="font-semibold text-ink-deep">Couldn’t open this book.</p>
          <p className="mt-1 text-graphite">{loadError}</p>
          <Button variant="secondary" className="mt-4" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      </>
    )
  if (book === undefined)
    return (
      <>
        <BackLink />
        <p className="mt-8 flex items-center gap-3 text-graphite" role="status">
          <Spinner className="size-5" /> Loading…
        </p>
      </>
    )
  if (bundled) return <BundledBook book={bundled} settings={book} onChange={setBook} />
  if (!book?.meta) return null
  return <CatalogEditor book={book} onChange={setBook} />
}

function BackLink() {
  return (
    <Link to="/admin/books" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost">
      <ArrowLeft className="size-5" /> Books
    </Link>
  )
}

// ── A book that comes with the app: publish or hide, Free or Premium ─────────

function BundledBook({ book, settings, onChange }: { book: Book; settings: CatalogBook | null; onChange: (b: CatalogBook) => void }) {
  const refreshLibrary = useLibrary((s) => s.refreshCatalog)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const status = settings?.status ?? 'published'
  const tier = settings?.tier ?? 'free'
  const act = async (fn: () => Promise<CatalogBook>) => {
    setBusy(true)
    setError(null)
    try {
      onChange(await fn())
      void refreshLibrary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <BackLink />
      <EditorHeading title={book.title} status={status} tier={tier} bundled />
      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <Panel title="Comes with the app">
          <p className="max-w-prose text-graphite">
            This book is built into Little Lines, so its pages and details can’t be edited here. You can hide it from
            families, make it Premium, or move it in the library from the Books list.
          </p>
          <ul className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {book.pages.map((p) => (
              <li key={p.id}>
                <img src={p.thumb} alt="" className="w-full rounded-[3px] bg-white shadow-paper" style={{ aspectRatio: '210 / 297' }} />
                <p className="mt-1.5 truncate text-[0.875rem] text-ink-deep">{p.title}</p>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="flex flex-col gap-6">
          <Panel title="In the library">
            <FormError>{error}</FormError>
            <p className="text-graphite">{status === 'published' ? 'Families can see and color this book.' : 'Hidden: families don’t see it.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant={status === 'published' ? 'secondary' : 'primary'}
                busy={busy}
                onClick={() => act(() => api.adminBookStatus(book.id, status === 'published' ? 'draft' : 'published', book.title))}
              >
                {status === 'published' ? 'Hide from families' : 'Show to families'}
              </Button>
              <ButtonLink to={`/admin/books/${book.id}/preview`} variant="ghost">
                <Eye className="size-5" /> Preview
              </ButtonLink>
            </div>
          </Panel>
          <TierPanel tier={tier} busy={busy} onChange={(t) => act(() => api.adminBookTier(book.id, t, book.title))} />
        </div>
      </div>
    </>
  )
}

function EditorHeading({ title, status, tier, bundled, isNew }: { title: string; status: CatalogBook['status']; tier: CatalogTier; bundled?: boolean; isNew?: boolean }) {
  return (
    <div className="mt-4">
      <h1 className="font-display text-title font-extrabold text-ink-deep">{title}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip status={status} bundled={bundled} />
        <TierChip tier={tier} />
        {isNew ? <NewChip /> : null}
      </div>
    </div>
  )
}

function TierPanel({ tier, busy, onChange }: { tier: CatalogTier; busy: boolean; onChange: (t: CatalogTier) => void }) {
  return (
    <Panel title="Plan">
      <div role="radiogroup" aria-label="Who can color this book" className="grid grid-cols-2 gap-1 rounded-full bg-frost p-1">
        {(['free', 'premium'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tier === t}
            disabled={busy}
            onClick={() => tier !== t && onChange(t)}
            className={cn('min-h-10 rounded-full text-[0.9375rem] font-semibold transition-colors', tier === t ? 'bg-paper text-ink-deep shadow-sm' : 'text-graphite hover:text-ink')}
          >
            {t === 'free' ? 'Free' : 'Premium'}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.9375rem] text-graphite">
        {tier === 'free' ? 'Every family can color it.' : 'Families on Trial or Premium can color it; families on Free see it locked.'}
      </p>
    </Panel>
  )
}

// ── A catalog book: everything editable ───────────────────────────────────────

function CatalogEditor({ book, onChange }: { book: CatalogBook; onChange: (b: CatalogBook) => void }) {
  const meta = book.meta!
  const navigate = useNavigate()
  const refreshLibrary = useLibrary((s) => s.refreshCatalog)
  const [details, setDetails] = useState<Details>(() => detailsFromMeta(meta))
  const [pages, setPages] = useState<CatalogPage[]>(book.pages)
  const [busy, setBusy] = useState<null | 'save' | 'status' | 'tier' | 'cover' | 'delete'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Start over from the saved book whenever the server returns a new version.
  useEffect(() => {
    setDetails(detailsFromMeta(book.meta!))
    setPages(book.pages)
  }, [book])

  const saved = useMemo(() => JSON.stringify({ d: detailsFromMeta(meta), p: book.pages }), [meta, book.pages])
  const dirty = JSON.stringify({ d: details, p: pages }) !== saved
  const missing = missingImages(book)
  const removed = book.pages.filter((p) => !pages.some((x) => x.id === p.id))

  async function run(kind: NonNullable<typeof busy>, fn: () => Promise<CatalogBook | void>, done?: string) {
    setBusy(kind)
    setError(null)
    setNotice(null)
    try {
      const next = await fn()
      if (next) onChange(next)
      if (done) setNotice(done)
      void refreshLibrary()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That didn’t work. Try again.')
    } finally {
      setBusy(null)
    }
  }

  const save = () =>
    run('save', () => api.adminUpdateBook(book.id, { meta: metaFromDetails(details, meta.theme, meta.pageSize), pages }), 'Changes saved.')

  const setStatus = (status: CatalogBook['status'], done: string) => run('status', () => api.adminBookStatus(book.id, status), done)

  async function replaceCover(file: File) {
    await run(
      'cover',
      async () => {
        const img = await coverFromFile(file)
        await api.adminBookImage(book.id, 'front-cover', img.image)
        await api.adminBookImage(book.id, 'front-cover-thumb', img.thumb)
        const palette = extractPalette(img.pixels)
        const hasCover = book.pages.some((p) => p.kind === 'front-cover')
        return api.adminUpdateBook(book.id, {
          meta: { ...meta, theme: { ...themeFrom(palette), palette: palette.slice(0, 18) } },
          pages: hasCover ? book.pages : [{ id: 'front-cover', kind: 'front-cover', title: 'Front cover' }, ...book.pages],
        })
      },
      'New cover saved. The book’s colors were updated to match it.',
    )
  }

  function movePage(id: string, by: number) {
    setPages((list) => {
      const lineArt = list.filter((p) => p.kind === 'line-art')
      const i = lineArt.findIndex((p) => p.id === id)
      const j = i + by
      if (i < 0 || j < 0 || j >= lineArt.length) return list
      ;[lineArt[i], lineArt[j]] = [lineArt[j], lineArt[i]]
      return [...list.filter((p) => p.kind === 'front-cover'), ...lineArt, ...list.filter((p) => p.kind === 'back-cover')]
    })
  }

  const cover = book.pages.find((p) => p.kind === 'front-cover')
  const lineArt = pages.filter((p) => p.kind === 'line-art')
  const isPublished = book.status === 'published'

  return (
    <>
      <BackLink />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <EditorHeading title={meta.title} status={book.status} tier={book.tier} isNew={isPublished && isNewBook(book)} />
        <ButtonLink to={`/admin/books/${book.id}/preview`} variant="secondary">
          <Eye className="size-5" /> Preview
        </ButtonLink>
      </div>

      {notice ? (
        <p role="status" className="mt-5 rounded-2xl bg-meadow/12 px-4 py-3 text-[0.9375rem] text-ink-deep">
          {notice}
        </p>
      ) : null}
      {error ? (
        <div className="mt-5">
          <FormError>{error}</FormError>
        </div>
      ) : null}
      {missing.length ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-error/8 px-4 py-3 text-[0.9375rem] text-error">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {missing.length} {missing.length === 1 ? 'page is' : 'pages are'} missing images ({missing.map((p) => p.title).join(', ')}). The upload
            didn’t finish. Remove those pages, or delete this draft and upload the PDF again.
          </span>
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Details">
            <BookDetailsFields value={details} onChange={setDetails} disabled={busy !== null} categories={CATEGORIES} />
          </Panel>

          <Panel title="Pages to color" aside={<span className="text-[0.875rem] text-graphite">{lineArt.length} pages</span>}>
            <ol className="flex flex-col divide-y divide-frost">
              {lineArt.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3 py-2.5">
                  <img
                    src={catalogImageUrl(book.id, `${p.id}-thumb`, book.version)}
                    alt=""
                    loading="lazy"
                    className="w-12 shrink-0 rounded-[3px] bg-white shadow-paper"
                    style={{ aspectRatio: `${meta.pageSize.width} / ${meta.pageSize.height}` }}
                  />
                  <span className="w-7 shrink-0 text-right text-[0.875rem] text-graphite tabular-nums">{i + 1}</span>
                  <input
                    aria-label={`Title of page ${i + 1}`}
                    value={p.title}
                    maxLength={80}
                    disabled={busy !== null}
                    onChange={(e) => setPages((list) => list.map((x) => (x.id === p.id ? { ...x, title: e.target.value } : x)))}
                    className="min-h-11 min-w-0 flex-1 rounded-xl bg-snow px-3 text-[1rem] text-ink-deep ring-2 ring-transparent outline-none ring-inset hover:ring-mist focus:bg-paper focus:ring-sky"
                  />
                  <span className="flex shrink-0">
                    <IconButton label={`Move ${p.title} up`} disabled={i === 0 || busy !== null} onClick={() => movePage(p.id, -1)}>
                      <ChevronUp className="size-4" />
                    </IconButton>
                    <IconButton label={`Move ${p.title} down`} disabled={i === lineArt.length - 1 || busy !== null} onClick={() => movePage(p.id, 1)}>
                      <ChevronDown className="size-4" />
                    </IconButton>
                    <IconButton
                      label={`Remove ${p.title}`}
                      disabled={lineArt.length === 1 || busy !== null}
                      onClick={() => setPages((list) => list.filter((x) => x.id !== p.id))}
                      danger
                    >
                      <X className="size-4" />
                    </IconButton>
                  </span>
                </li>
              ))}
            </ol>
            {removed.length ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-snow px-4 py-3 text-[0.9375rem]">
                <span className="text-ink-deep">
                  Removed when you save: {removed.map((p) => p.title).join(', ')}.
                  {isPublished ? ' Children’s coloring of them is kept but no longer shows in their gallery.' : ''}
                </span>
                <button type="button" onClick={() => setPages(book.pages)} className="inline-flex items-center gap-1 font-semibold text-ink hover:underline">
                  <Undo2 className="size-4" /> Undo
                </button>
              </div>
            ) : null}
          </Panel>
        </div>

        <div className="flex flex-col gap-6">
          <Panel title="Publishing">
            <p className="text-graphite">
              {book.status === 'published'
                ? `Every family can see this book${book.publishedAt ? ` (published ${formatDate(book.publishedAt)})` : ''}.`
                : book.status === 'archived'
                  ? 'Archived: hidden from families and out of the library order.'
                  : 'Draft: only you can see it.'}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              {book.status !== 'published' ? (
                <Button busy={busy === 'status'} disabled={busy !== null || dirty || missing.length > 0} onClick={() => setStatus('published', `${meta.title} is published.`)}>
                  <Send className="size-5" /> Publish to families
                </Button>
              ) : (
                <Button variant="secondary" busy={busy === 'status'} disabled={busy !== null} onClick={() => setStatus('draft', 'Unpublished: back to draft.')}>
                  Unpublish
                </Button>
              )}
              {book.status === 'archived' ? (
                <Button variant="ghost" disabled={busy !== null} onClick={() => setStatus('draft', 'Restored as a draft.')}>
                  <RotateCcw className="size-5" /> Restore as draft
                </Button>
              ) : (
                <Button variant="ghost" disabled={busy !== null} onClick={() => setStatus('archived', 'Archived.')}>
                  <Archive className="size-5" /> Archive
                </Button>
              )}
            </div>
            {dirty && book.status !== 'published' ? <p className="mt-3 text-[0.875rem] text-graphite">Save your changes before publishing.</p> : null}
          </Panel>

          <TierPanel tier={book.tier} busy={busy !== null} onChange={(t) => run('tier', () => api.adminBookTier(book.id, t), t === 'premium' ? 'Now Premium.' : 'Now Free.')} />

          {isPublished ? <AnnouncePanel bookId={book.id} title={meta.title} /> : null}

          <Panel title="Cover">
            {cover ? (
              <img src={catalogImageUrl(book.id, 'front-cover-thumb', book.version)} alt={`Cover of ${meta.title}`} className="mx-auto w-40 rounded-[3px_6px_6px_3px] shadow-book" />
            ) : (
              <p className="text-graphite">No cover yet. Families see the first page instead.</p>
            )}
            <div className="mt-3 flex gap-1.5" aria-label="Book colors, taken from the cover">
              {meta.theme.palette.slice(0, 10).map((c) => (
                <span key={c} className="size-5 rounded-full ring-1 ring-ink/10" style={{ backgroundColor: c }} title={c} />
              ))}
            </div>
            <label
              className={cn(
                'mt-4 inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-full bg-paper px-5 font-semibold text-ink ring-2 ring-mist ring-inset hover:ring-ink/40',
                (busy !== null || dirty) && 'pointer-events-none opacity-50',
              )}
            >
              {busy === 'cover' ? <Spinner /> : <ImageUp className="size-5" />} {cover ? 'Replace cover' : 'Add a cover'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                disabled={busy !== null || dirty}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) void replaceCover(f)
                }}
              />
            </label>
            {dirty ? <p className="mt-2 text-[0.875rem] text-graphite">Save or discard your changes first.</p> : null}
          </Panel>

          <Panel title="About this book">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[0.9375rem]">
              <dt className="text-graphite">Added</dt>
              <dd className="text-ink-deep">{book.origin === 'family-import' ? 'Imported by a family' : 'Uploaded from a PDF'}</dd>
              <dt className="text-graphite">Created</dt>
              <dd className="text-ink-deep">{formatDate(book.createdAt)}</dd>
              <dt className="text-graphite">Last change</dt>
              <dd className="text-ink-deep">{formatWhen(book.updatedAt)}</dd>
            </dl>
            {book.status !== 'published' ? (
              <Button variant="danger" className="mt-5" disabled={busy !== null} onClick={() => setDeleting(true)}>
                <Trash2 className="size-5" /> Delete permanently
              </Button>
            ) : null}
          </Panel>
        </div>
      </div>

      {dirty ? (
        <div className="sticky bottom-0 z-10 mt-8 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-mist bg-snow/95 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8 lg:-mx-10 lg:px-10">
          <p className="mr-auto text-[0.9375rem] text-ink-deep">You have unsaved changes{isPublished ? '; families see them as soon as you save' : ''}.</p>
          <Button
            variant="ghost"
            disabled={busy !== null}
            onClick={() => {
              setDetails(detailsFromMeta(meta))
              setPages(book.pages)
            }}
          >
            Discard
          </Button>
          <Button busy={busy === 'save'} disabled={busy !== null || !details.title.trim()} onClick={save}>
            Save changes
          </Button>
        </div>
      ) : null}

      {deleting ? (
        <DeleteDialog
          title={meta.title}
          busy={busy === 'delete'}
          onClose={() => setDeleting(false)}
          onConfirm={async (typed) => {
            await run('delete', async () => {
              await api.adminDeleteBook(book.id, typed)
              navigate('/admin/books', { replace: true })
            })
          }}
        />
      ) : null}
    </>
  )
}

/** Email every family that gets new book emails about this book. Once per family. */
function AnnouncePanel({ bookId, title }: { bookId: string; title: string }) {
  const [status, setStatus] = useState<{ announcedAt: number | null; sentTo: number; recipients: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    api
      .adminAnnounceStatus(bookId)
      .then(setStatus)
      .catch(() => setStatus(null))
  }, [bookId])
  useEffect(load, [load])

  return (
    <Panel title="Announce">
      {status?.announcedAt ? (
        <p className="text-graphite">
          Announced {formatWhen(status.announcedAt).toLowerCase()} to {status.sentTo} {status.sentTo === 1 ? 'family' : 'families'}. Families who
          joined since can be told too; nobody gets it twice.
        </p>
      ) : (
        <p className="text-graphite">Email the families who get new book emails that “{title}” is here.</p>
      )}
      {result ? (
        <p role="status" className="mt-3 text-[0.9375rem] text-meadow-ink">
          {result}
        </p>
      ) : null}
      {error ? (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
      <Button variant="secondary" className="mt-4" disabled={!status || busy} busy={busy} onClick={() => setConfirming(true)}>
        <Send className="size-5" /> {status?.announcedAt ? 'Tell newer families' : 'Announce to families'}
      </Button>
      {confirming && status ? (
        <Dialog label="Announce book" onClose={() => setConfirming(false)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Email families about {title}?</h2>
          <p className="mt-2 text-graphite">
            Up to {status.recipients} {status.recipients === 1 ? 'family' : 'families'} get new book emails
            {status.sentTo ? `; the ${status.sentTo} already told are skipped` : ''}. Each email has a link to stop them.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={async () => {
                setConfirming(false)
                setBusy(true)
                setError(null)
                try {
                  const r = await api.adminAnnounce(bookId)
                  setResult(`Sent to ${r.sent} ${r.sent === 1 ? 'family' : 'families'}${r.failed ? `; ${r.failed} failed (see Emails)` : ''}.`)
                  load()
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Couldn’t send.')
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Send className="size-5" /> Send emails
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </Dialog>
      ) : null}
    </Panel>
  )
}

function IconButton({ label, disabled, onClick, danger, children }: { label: string; disabled?: boolean; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn('grid size-9 place-items-center rounded-lg text-graphite disabled:opacity-30', danger ? 'hover:bg-error/10 hover:text-error' : 'hover:bg-frost hover:text-ink')}
    >
      {children}
    </button>
  )
}

function DeleteDialog({ title, busy, onClose, onConfirm }: { title: string; busy: boolean; onClose: () => void; onConfirm: (typed: string) => void }) {
  const [typed, setTyped] = useState('')
  return (
    <Dialog label="Delete book" onClose={onClose}>
      <h2 className="font-display text-heading font-bold text-ink-deep">Delete {title}?</h2>
      <p className="mt-2 text-graphite">
        The book, its pages and images are deleted for good, and any coloring of it disappears from children’s
        galleries. This can’t be undone; to just hide the book, archive it instead.
      </p>
      <TextField className="mt-5" label={`Type “${title}” to confirm`} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
      <div className="mt-6 flex flex-col gap-3">
        <Button variant="danger" busy={busy} disabled={typed.trim() !== title} onClick={() => onConfirm(typed)}>
          <Trash2 className="size-5" /> Delete permanently
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Keep it
        </Button>
      </div>
    </Dialog>
  )
}
