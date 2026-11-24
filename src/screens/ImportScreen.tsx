import { ArrowLeft, BookOpen, Check, FileUp } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, FormError, Spinner, TextField, cn } from '../components/ui'
import { saveImportedBook, type NewPage } from '../data/imported-books'
import { COLOR_PAGE, extractPalette, themeFrom } from '../import/convert'
import { coverImages, lineArtImages, MAX_PAGES, openPdf, previewPages, type PagePreview, type PdfDoc } from '../import/pdf'
import { useLibrary } from '../state/library-store'
import { useSession } from '../state/session-store'
import { NotFound } from './NotFound'
import { useTitle } from '../lib/useTitle'

type Role = 'front-cover' | 'line-art' | 'back-cover' | 'skip'

const ROLES: Array<{ id: Role; label: string }> = [
  { id: 'front-cover', label: 'Cover' },
  { id: 'line-art', label: 'Color' },
  { id: 'back-cover', label: 'Back' },
  { id: 'skip', label: 'Skip' },
]

/** Used when a book has no cover to pull colors from. */
const DEFAULT_PALETTE = [
  '#e0475b', '#a3243a', '#f28a2e', '#f2c230', '#3ba55c', '#1f6b45', '#7cc4e8', '#3d8be8',
  '#2b3f8c', '#8559d9', '#e98bb6', '#8a5a3b', '#d9a77c', '#ffffff', '#9aa3b5', '#3a3a44',
]

type Step =
  | { name: 'choose' }
  | { name: 'reading'; done: number; total: number }
  | { name: 'review' }
  | { name: 'saving'; done: number; total: number }
  | { name: 'done'; bookId: string; title: string }

interface PageChoice extends PagePreview {
  role: Role
  title: string
}

/** Guess roles: a painted first page is the cover, a painted last page the back, other painted pages are skipped. */
function guessRoles(pages: PagePreview[]): PageChoice[] {
  return pages.map((p, i) => {
    const painted = p.colorful >= COLOR_PAGE
    let role: Role = painted ? 'skip' : 'line-art'
    if (painted && i === 0) role = 'front-cover'
    else if (painted && i === pages.length - 1) role = 'back-cover'
    return { ...p, role, title: '' }
  })
}

export function ImportScreen() {
  const account = useSession((s) => s.account)
  useTitle('Add a book from a PDF')
  const reload = useLibrary((s) => s.load)
  const navigate = useNavigate()
  const docRef = useRef<PdfDoc | null>(null)
  const [step, setStep] = useState<Step>({ name: 'choose' })
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<PageChoice[]>([])
  const [details, setDetails] = useState({ title: '', subtitle: '', tags: '', ageRange: '' })
  const [dragging, setDragging] = useState(false)
  const [tooMany, setTooMany] = useState(0)

  useEffect(() => () => void docRef.current?.loadingTask.destroy(), [])

  if (account?.role !== 'admin') return <NotFound />

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
      setDetails((d) => ({ ...d, title: title ?? file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() }))
      setStep({ name: 'review' })
    } catch (err) {
      const name = (err as { name?: string })?.name
      setError(
        name === 'PasswordException'
          ? 'This PDF is locked with a password. Unlock it first, then import it.'
          : 'This PDF couldn’t be read. Try another file.',
      )
      setStep({ name: 'choose' })
    }
  }

  function setRole(number: number, role: Role) {
    setPages((list) =>
      list.map((p) => {
        if (p.number === number) return { ...p, role }
        // Only one front cover and one back cover.
        if ((role === 'front-cover' || role === 'back-cover') && p.role === role) return { ...p, role: 'skip' }
        return p
      }),
    )
  }

  const toColor = pages.filter((p) => p.role === 'line-art')
  const front = pages.find((p) => p.role === 'front-cover')
  const back = pages.find((p) => p.role === 'back-cover')

  async function save() {
    const doc = docRef.current
    if (!doc || !account) return
    if (toColor.length === 0) {
      setError('Choose at least one page to color.')
      return
    }
    setError(null)
    const order = pages.filter((p) => p.role !== 'skip')
    // Keep the book in reading order: cover first, back last.
    order.sort((a, b) => rank(a.role) - rank(b.role) || a.number - b.number)
    setStep({ name: 'saving', done: 0, total: order.length })
    try {
      const out: NewPage[] = []
      let palette = DEFAULT_PALETTE
      let pageSize: { width: number; height: number } | null = null
      let colorIndex = 0
      for (const [i, p] of order.entries()) {
        if (p.role === 'line-art') {
          colorIndex++
          const img = await lineArtImages(doc, p.number)
          pageSize ??= img.size
          out.push({ kind: 'line-art', title: p.title.trim() || `Page ${colorIndex}`, image: img.image, thumb: img.thumb })
        } else {
          const img = await coverImages(doc, p.number)
          if (p.role === 'front-cover') palette = extractPalette(img.pixels)
          out.push({ kind: p.role as 'front-cover' | 'back-cover', title: p.role === 'front-cover' ? 'Front cover' : 'Back cover', image: img.image, thumb: img.thumb })
        }
        setStep({ name: 'saving', done: i + 1, total: order.length })
      }
      const tags = details.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((t) => t[0].toUpperCase() + t.slice(1))
      const bookId = await saveImportedBook({
        title: details.title,
        subtitle: details.subtitle,
        description: '',
        ageRange: details.ageRange,
        tags,
        theme: { ...themeFrom(palette), palette: palette.slice(0, 18) },
        pageSize: pageSize ?? { width: 1600, height: 2263 },
        pages: out,
        createdBy: account.id,
      })
      await reload()
      setStep({ name: 'done', bookId, title: details.title.trim() || 'Untitled book' })
    } catch {
      setError('Saving the book didn’t finish. There may not be enough space on this device. Try again with fewer pages.')
      setStep({ name: 'review' })
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) void read(file)
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pt-6 pb-14 sm:px-8">
      <Link to="/grown-ups" className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-full px-2 font-semibold text-ink hover:bg-frost">
        <ArrowLeft className="size-5" /> Grown-ups
      </Link>
      <h1 className="mt-6 font-display text-title font-extrabold text-ink-deep">Add a book from a PDF</h1>
      <p className="mt-1 max-w-prose text-graphite">
        Pick which pages are covers and which are for coloring. Coloring pages are turned into clean black lines that
        every child on this device can color.
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
            'mt-8 flex min-h-64 cursor-pointer flex-col items-center justify-center gap-3 rounded-[28px] border-[3px] border-dashed px-6 py-10 text-center transition-colors',
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

      {step.name === 'review' || step.name === 'saving' ? (
        <>
          <section className="mt-8 grid gap-5 rounded-[28px] bg-paper p-5 shadow-paper sm:grid-cols-2 sm:p-6">
            <TextField label="Book title" value={details.title} onChange={(e) => setDetails({ ...details, title: e.target.value })} />
            <TextField
              label="Subtitle"
              value={details.subtitle}
              placeholder="A coloring book for…"
              onChange={(e) => setDetails({ ...details, subtitle: e.target.value })}
            />
            <TextField
              label="Topics"
              hint="Separate with commas, e.g. Animals, Winter"
              value={details.tags}
              onChange={(e) => setDetails({ ...details, tags: e.target.value })}
            />
            <TextField
              label="Best for ages"
              placeholder="6–10"
              value={details.ageRange}
              onChange={(e) => setDetails({ ...details, ageRange: e.target.value })}
            />
          </section>

          <section className="mt-8">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="font-display text-heading font-bold text-ink-deep">Pages</h2>
              <p className="text-graphite" role="status">
                {front ? '1 cover, ' : 'No cover, '}
                {toColor.length === 1 ? '1 page to color' : `${toColor.length} pages to color`}
                {back ? ', 1 back cover' : ''}
              </p>
            </div>
            {tooMany ? <p className="mt-2 text-[0.9375rem] text-graphite">Only the first {MAX_PAGES} pages are shown; {tooMany} more were left out.</p> : null}
            <ul className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {pages.map((p) => (
                <li key={p.number} className={cn('rounded-3xl bg-paper p-3 ring-2 ring-inset', p.role === 'skip' ? 'ring-mist opacity-60' : 'ring-ink/15')}>
                  <img
                    src={p.preview}
                    alt={`Page ${p.number}`}
                    className="mx-auto max-h-56 w-full rounded-[4px] object-contain shadow-paper"
                    style={{ aspectRatio: String(p.aspect) }}
                  />
                  <p className="mt-2 text-[0.8125rem] text-graphite">PDF page {p.number}</p>
                  <div role="radiogroup" aria-label={`PDF page ${p.number} is a`} className="mt-1.5 grid grid-cols-4 gap-1">
                    {ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        role="radio"
                        aria-checked={p.role === r.id}
                        disabled={step.name === 'saving'}
                        onClick={() => setRole(p.number, r.id)}
                        className={cn(
                          'min-h-9 rounded-full text-[0.75rem] font-semibold',
                          p.role === r.id ? 'bg-ink text-white' : 'text-graphite hover:bg-frost',
                        )}
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
                      disabled={step.name === 'saving'}
                      onChange={(e) => setPages((list) => list.map((x) => (x.number === p.number ? { ...x, title: e.target.value } : x)))}
                      className="mt-2 min-h-10 w-full rounded-xl bg-snow px-3 text-[0.9375rem] ring-2 ring-inset ring-mist outline-none focus:ring-sky"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          <div className="sticky bottom-0 mt-8 flex flex-wrap items-center justify-end gap-3 border-t-2 border-frost bg-snow/95 py-4 backdrop-blur">
            <div className="mr-auto min-w-0">
              <FormError>{error}</FormError>
            </div>
            <Button variant="ghost" onClick={() => setStep({ name: 'choose' })} disabled={step.name === 'saving'}>
              Choose another PDF
            </Button>
            <Button size="lg" onClick={save} busy={step.name === 'saving'} disabled={toColor.length === 0}>
              {step.name === 'saving' ? `Preparing page ${step.done} of ${step.total}…` : 'Add book to the library'}
            </Button>
          </div>
        </>
      ) : null}

      {step.name === 'done' ? (
        <section className="mt-8 flex max-w-lg flex-col items-start rounded-[28px] bg-paper p-6 shadow-paper sm:p-8" role="status">
          <span className="grid size-12 place-items-center rounded-full bg-meadow-ink text-white">
            <Check className="size-6" strokeWidth={3} />
          </span>
          <h2 className="mt-4 font-display text-heading font-bold text-ink-deep">{step.title} is in the library</h2>
          <p className="mt-2 text-graphite">Every child on this device can open it now.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={() => navigate(`/books/${step.bookId}`)}>
              <BookOpen className="size-5" /> Open the book
            </Button>
            <Button variant="secondary" onClick={() => setStep({ name: 'choose' })}>
              Add another PDF
            </Button>
          </div>
        </section>
      ) : null}

      {step.name === 'choose' && error ? (
        <div className="mt-4">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </div>
  )
}

function rank(role: Role): number {
  return role === 'front-cover' ? 0 : role === 'back-cover' ? 2 : 1
}
