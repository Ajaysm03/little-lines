import { ArrowLeft, Check, Eye, FileUp, Pencil } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, cn, FormError, Spinner } from '../components/ui'
import { BUNDLED_BOOKS } from '../content/books'
import { api, type CatalogMeta, type CatalogPage } from '../data/api'
import { COLOR_PAGE, extractPalette, themeFrom } from '../import/convert'
import { coverImages, lineArtImages, MAX_PAGES, openPdf, previewPages, type PagePreview, type PdfDoc } from '../import/pdf'
import { useTitle } from '../lib/useTitle'
import { BookDetailsFields, CATEGORIES, emptyDetails, metaFromDetails, type Details } from './BookDetailsFields'

type Role = 'front-cover' | 'line-art' | 'back-cover' | 'skip'

const ROLES: Array<{ id: Role; label: string }> = [
  { id: 'front-cover', label: 'Cover' },
  { id: 'line-art', label: 'Color' },
  { id: 'back-cover', label: 'Back' },
  { id: 'skip', label: 'Skip' },
]

type Step =
  | { name: 'choose' }
  | { name: 'reading'; done: number; total: number }
  | { name: 'review' }
  | { name: 'uploading'; done: number; total: number; label: string }
  | { name: 'done'; bookId: string; title: string }

interface PageChoice extends PagePreview {
  role: Role
  title: string
}

/** A painted first page is the cover, a painted last page the back; other painted pages are skipped. */
function guessRoles(pages: PagePreview[]): PageChoice[] {
  return pages.map((p, i) => {
    const painted = p.colorful >= COLOR_PAGE
    let role: Role = painted ? 'skip' : 'line-art'
    if (painted && i === 0) role = 'front-cover'
    else if (painted && i === pages.length - 1) role = 'back-cover'
    return { ...p, role, title: '' }
  })
}

const rank = (role: Role) => (role === 'front-cover' ? 0 : role === 'back-cover' ? 2 : 1)

/**
 * Upload a PDF as a new draft: pick covers and coloring pages, name them, add the
 * book's details. Pages are converted in this browser (clean line art) and sent
 * one image at a time, so a big book never hits the server's upload limit.
 */
export function AdminBookUpload() {
  useTitle('Upload a PDF')
  const navigate = useNavigate()
  const docRef = useRef<PdfDoc | null>(null)
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<PageChoice[]>([])
  const [details, setDetails] = useState<Details>(emptyDetails())
  const [dragging, setDragging] = useState(false)
  const [tooMany, setTooMany] = useState(0)
  const [draftId, setDraftId] = useState<string | null>(null)

  useEffect(() => () => void docRef.current?.loadingTask.destroy(), [])

  async function read(file: File) {
    setError(null)
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('That file isn’t a PDF. Choose a file that ends in .pdf.')
      return
    }
    setStep({ name: 'reading', done: 0, total: 0 })
    try {
      await docRef.current?.loadingTask.destroy()
      const { doc, title } = await openPdf(file)
      docRef.current = doc
      setTooMany(Math.max(0, doc.numPages - MAX_PAGES))
      const previews = await previewPages(doc, (done, total) => setStep({ name: 'reading', done, total }))
      setPages(guessRoles(previews))
      setDetails((d) => ({ ...d, title: d.title || title || file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() }))
      setStep({ name: 'review' })
    } catch (err) {
      const name = (err as { name?: string })?.name
      setError(name === 'PasswordException' ? 'This PDF is locked with a password. Unlock it first, then upload it.' : 'This PDF couldn’t be read. Try another file.')
      setStep({ name: 'choose' })
    }
  }

  function setRole(number: number, role: Role) {
    setPages((list) =>
      list.map((p) => {
        if (p.number === number) return { ...p, role }
        if ((role === 'front-cover' || role === 'back-cover') && p.role === role) return { ...p, role: 'skip' }
        return p
      }),
    )
  }

  const toColor = pages.filter((p) => p.role === 'line-art')
  const front = pages.find((p) => p.role === 'front-cover')
  const back = pages.find((p) => p.role === 'back-cover')

  async function upload() {
    const doc = docRef.current
    if (!doc) return
    if (!details.title.trim()) return setError('Give the book a title.')
    if (toColor.length === 0) return setError('Choose at least one page to color.')
    setError(null)
    const chosen = pages.filter((p) => p.role !== 'skip').sort((a, b) => rank(a.role) - rank(b.role) || a.number - b.number)
    let n = 0
    const plan = chosen.map((p) => {
      const kind = p.role as CatalogPage['kind']
      const id = kind === 'line-art' ? `p${String(++n).padStart(2, '0')}` : kind
      const title = kind === 'line-art' ? p.title.trim() || `Page ${n}` : kind === 'front-cover' ? 'Front cover' : 'Back cover'
      return { pdfPage: p.number, page: { id, kind, title } as CatalogPage }
    })
    const total = plan.length
    let meta: CatalogMeta = metaFromDetails(details, { ...BUNDLED_BOOKS[0].theme, palette: [] }, { width: 1600, height: 2263 })
    let bookId = draftId
    try {
      setStep({ name: 'uploading', done: 0, total, label: 'Creating the draft…' })
      if (!bookId) {
        bookId = (await api.adminCreateBook({ meta, pages: plan.map((x) => x.page) })).id
        setDraftId(bookId)
      } else await api.adminUpdateBook(bookId, { meta, pages: plan.map((x) => x.page) })
      let pageSize: CatalogMeta['pageSize'] | null = null
      for (const [i, x] of plan.entries()) {
        setStep({ name: 'uploading', done: i, total, label: `Uploading ${x.page.title} (${i + 1} of ${total})…` })
        if (x.page.kind === 'line-art') {
          const img = await lineArtImages(doc, x.pdfPage)
          pageSize ??= img.size
          await api.adminBookImage(bookId, x.page.id, img.image)
          await api.adminBookImage(bookId, `${x.page.id}-thumb`, img.thumb)
        } else {
          const img = await coverImages(doc, x.pdfPage)
          if (x.page.kind === 'front-cover') {
            const palette = extractPalette(img.pixels)
            meta = { ...meta, theme: { ...themeFrom(palette), palette: palette.slice(0, 18) } }
          }
          await api.adminBookImage(bookId, x.page.id, img.image)
          await api.adminBookImage(bookId, `${x.page.id}-thumb`, img.thumb)
        }
      }
      setStep({ name: 'uploading', done: total, total, label: 'Finishing…' })
      await api.adminUpdateBook(bookId, { meta: { ...meta, pageSize: pageSize ?? meta.pageSize } })
      setStep({ name: 'done', bookId, title: meta.title })
    } catch (err) {
      setError(
        `${err instanceof Error ? err.message : 'The upload stopped.'} ${bookId ? 'The draft is saved; press the button again to finish uploading, or delete the draft from Books.' : ''}`,
      )
      setStep({ name: 'review' })
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void read(file)
  }

  const busy = step.name === 'uploading'

  return (
    <>
      <Link to="/admin/books" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost">
        <ArrowLeft className="size-5" /> Books
      </Link>
      <h1 className="mt-4 font-display text-title font-semibold text-ink-deep">Upload a PDF</h1>
      <p className="mt-1 max-w-prose text-graphite">
        Pick which pages are covers and which are for coloring. Coloring pages become clean black lines. The book is
        saved as a draft that only you can see until you publish it.
      </p>

      {step.name === 'choose' || step.name === 'reading' ? (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'mt-8 flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-[3px] border-dashed px-6 py-10 text-center transition-colors',
            dragging ? 'border-sky bg-sky/8' : 'border-mist bg-paper hover:border-ink/30',
          )}
        >
          {step.name === 'reading' ? (
            <>
              <Spinner className="size-7 text-ink" />
              <span className="font-semibold text-ink-deep" role="status">
                {step.total ? `Reading page ${step.done} of ${step.total}…` : 'Opening the PDF…'}
              </span>
            </>
          ) : (
            <>
              <FileUp className="size-10 text-ink" />
              <span className="font-display text-heading font-bold text-ink-deep">Choose a PDF</span>
              <span className="text-graphite">or drop it here. Up to {MAX_PAGES} pages.</span>
            </>
          )}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={step.name === 'reading'}
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) void read(f)
            }}
          />
        </label>
      ) : null}

      {step.name === 'choose' && error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}

      {step.name === 'review' || step.name === 'uploading' ? (
        <>
          <section className="mt-8 rounded-3xl bg-paper p-5 ring-1 ring-mist sm:p-6">
            <h2 className="font-display text-[1.25rem] font-bold text-ink-deep">Details</h2>
            <BookDetailsFields value={details} onChange={setDetails} disabled={busy} categories={CATEGORIES} />
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-[1.25rem] font-bold text-ink-deep">Pages</h2>
              <p className="text-graphite" role="status">
                {front ? '1 cover, ' : 'No cover, '}
                {toColor.length === 1 ? '1 page to color' : `${toColor.length} pages to color`}
                {back ? ', 1 back cover' : ''}
              </p>
            </div>
            {tooMany ? <p className="mt-2 text-[0.9375rem] text-graphite">Only the first {MAX_PAGES} pages are shown; {tooMany} more were left out.</p> : null}
            <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {pages.map((p) => (
                <li key={p.number} className={cn('rounded-2xl bg-paper p-3 ring-1', p.role === 'skip' ? 'opacity-60 ring-mist' : 'ring-ink/20')}>
                  <img src={p.preview} alt={`PDF page ${p.number}`} className="mx-auto max-h-56 w-full rounded-[4px] object-contain shadow-paper" style={{ aspectRatio: String(p.aspect) }} />
                  <p className="mt-2 text-[0.8125rem] text-graphite">PDF page {p.number}</p>
                  <div role="radiogroup" aria-label={`PDF page ${p.number} is a`} className="mt-1.5 grid grid-cols-4 gap-1">
                    {ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={p.role === r.id}
                        disabled={busy}
                        onClick={() => setRole(p.number, r.id)}
                        className={cn('min-h-9 rounded-full text-[0.75rem] font-semibold', p.role === r.id ? 'bg-ink text-white' : 'text-graphite hover:bg-frost')}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  {p.role === 'line-art' ? (
                    <input
                      aria-label={`Title for PDF page ${p.number}`}
                      placeholder="Page title"
                      value={p.title}
                      disabled={busy}
                      onChange={(e) => setPages((list) => list.map((x) => (x.number === p.number ? { ...x, title: e.target.value } : x)))}
                      className="mt-2 min-h-10 w-full rounded-xl bg-snow px-3 text-[0.9375rem] ring-2 ring-mist outline-none ring-inset focus:ring-sky"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-end gap-3 border-t border-mist bg-snow/95 py-4 backdrop-blur">
            <div className="mr-auto min-w-0 max-w-xl">
              {step.name === 'uploading' ? (
                <div role="status">
                  <p className="text-[0.9375rem] text-ink-deep">{step.label}</p>
                  <progress max={step.total} value={step.done} className="mt-1 h-2 w-64 max-w-full accent-ink" />
                </div>
              ) : (
                <FormError>{error}</FormError>
              )}
            </div>
            {!draftId ? (
              <Button variant="ghost" onClick={() => setStep({ name: 'choose' })} disabled={busy}>
                Choose another PDF
              </Button>
            ) : null}
            <Button size="lg" onClick={upload} busy={busy} disabled={toColor.length === 0}>
              {draftId ? 'Finish uploading' : 'Save as draft'}
            </Button>
          </div>
        </>
      ) : null}

      {step.name === 'done' ? (
        <section className="mt-8 flex max-w-lg flex-col items-start rounded-3xl bg-paper p-6 ring-1 ring-mist sm:p-8" role="status">
          <span className="grid size-12 place-items-center rounded-full bg-meadow-ink text-white">
            <Check className="size-6" strokeWidth={3} />
          </span>
          <h2 className="mt-4 font-display text-heading font-bold text-ink-deep">{step.title} is saved as a draft</h2>
          <p className="mt-2 text-graphite">Only you can see it. Preview it, check the details, then publish it to every family.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => navigate(`/admin/books/${step.bookId}`)}>
              <Pencil className="size-5" /> Review and publish
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/admin/books/${step.bookId}/preview`)}>
              <Eye className="size-5" /> Preview
            </Button>
          </div>
        </section>
      ) : null}
    </>
  )
}
