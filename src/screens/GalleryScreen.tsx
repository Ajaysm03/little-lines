import { Download, Paintbrush, Palette, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router'
import { StickerBadge } from '../components/Sticker'
import { ButtonLink, Spinner, cn } from '../components/ui'
import { getBook, type Book, type BookPage } from '../content/books'
import { CRAYONS } from '../content/profile-options'
import type { Artwork } from '../data/types'
import { downloadPicture } from '../lib/export'
import { useArtworkThumbs, useProfileInsights } from '../state/hooks'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'

type Filter = 'all' | 'finished' | 'in-progress'

interface Piece {
  art: Artwork
  book: Book
  page: BookPage
}

/** Small, fixed tilts so the fridge looks hand-hung but doesn't reshuffle on every visit. */
const TILTS = [-2.2, 1.4, -0.8, 2, -1.6, 0.9]

export function GalleryScreen() {
  const profileId = useSession((s) => s.profileId) ?? ''
  const insights = useProfileInsights()
  const thumbs = useArtworkThumbs(insights?.artworks)
  const markSeen = usePrefs((s) => s.markStickersSeen)
  const location = useLocation()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<Piece | null>(null)

  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = []
    for (const art of insights?.artworks ?? []) {
      if (art.progress <= 0 && !art.completedAt) continue
      const book = getBook(art.bookId)
      const page = book?.pages.find((p) => p.id === art.pageId)
      if (book && page) out.push({ art, book, page })
    }
    return out.sort((a, b) => b.art.updatedAt - a.art.updatedAt)
  }, [insights?.artworks])

  const shown = pieces.filter((p) =>
    filter === 'all' ? true : filter === 'finished' ? Boolean(p.art.completedAt) : !p.art.completedAt,
  )

  // Opening the gallery counts as having seen any new stickers.
  const earnedIds = insights?.stickers.filter((s) => s.earned).map((s) => s.id).join(',')
  useEffect(() => {
    if (profileId && earnedIds) markSeen(profileId, earnedIds.split(','))
  }, [profileId, earnedIds, markSeen])

  useEffect(() => {
    if (location.hash === '#stickers' && insights) document.getElementById('stickers')?.scrollIntoView({ behavior: 'smooth' })
  }, [location.hash, insights])

  if (!insights) {
    return (
      <main className="grid min-h-[50dvh] place-items-center text-graphite">
        <Spinner className="size-6" />
      </main>
    )
  }
  const earned = insights.stickers.filter((s) => s.earned).length

  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <h1 className="font-display text-title font-extrabold text-ink-deep">My art</h1>

      {pieces.length === 0 ? (
        <div className="mt-10 flex max-w-lg flex-col items-start rounded-[28px] bg-paper px-6 py-8 shadow-paper sm:px-8">
          <Palette className="size-10 text-[var(--crayon)]" />
          <h2 className="mt-4 font-display text-heading font-bold text-ink-deep">Your fridge is waiting</h2>
          <p className="mt-2 text-graphite">Every page you color gets hung up here, ready to show off.</p>
          <ButtonLink to="/library" className="mt-6">
            Pick a page to color
          </ButtonLink>
        </div>
      ) : (
        <>
          <div role="radiogroup" aria-label="Show pictures" className="mt-6 flex flex-wrap gap-2">
            {(
              [
                ['all', `All (${pieces.length})`],
                ['finished', `Finished (${pieces.filter((p) => p.art.completedAt).length})`],
                ['in-progress', `Still coloring (${pieces.filter((p) => !p.art.completedAt).length})`],
              ] as Array<[Filter, string]>
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={filter === id}
                onClick={() => setFilter(id)}
                className={cn(
                  'min-h-10 rounded-full px-4 text-[0.9375rem] font-semibold',
                  filter === id ? 'bg-ink text-white' : 'bg-paper text-ink ring-2 ring-inset ring-mist hover:ring-ink/30',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* The fridge door */}
          <div
            className="mt-6 rounded-[32px] px-4 pt-8 pb-6 sm:px-8"
            style={{ background: 'linear-gradient(100deg, #f7f9fc 0%, #eef2f8 45%, #f8fafd 55%, #e9eef6 100%)', boxShadow: 'inset 0 0 0 2px #e3e8f1' }}
          >
            {shown.length === 0 ? (
              <p className="py-10 text-center text-graphite">No pictures here yet.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
                {shown.map((p, i) => (
                  <li key={p.art.id}>
                    <button
                      type="button"
                      onClick={() => setOpen(p)}
                      className="group relative block w-full text-left"
                      style={{ transform: `rotate(${TILTS[i % TILTS.length]}deg)` }}
                    >
                      {/* Magnet */}
                      <span
                        aria-hidden
                        className="absolute -top-3 left-1/2 z-10 size-7 -translate-x-1/2 rounded-full shadow-[0_3px_6px_-2px_rgb(0_0_0/0.45),inset_0_-3px_0_rgb(0_0_0/0.15),inset_0_3px_0_rgb(255_255_255/0.4)]"
                        style={{ backgroundColor: CRAYONS[i % CRAYONS.length].hex }}
                      />
                      <span className="relative block aspect-[210/297] overflow-hidden bg-[#fffefb] shadow-[0_14px_24px_-14px_rgb(27_30_69/0.55)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:rotate-1">
                        {thumbs.get(`${p.book.id}:${p.page.id}`) ? (
                          <img src={thumbs.get(`${p.book.id}:${p.page.id}`)} alt="" className="absolute inset-0 size-full" />
                        ) : null}
                        <img src={p.page.thumb} alt="" loading="lazy" className="absolute inset-0 size-full mix-blend-multiply" />
                      </span>
                      <span className="mt-3 block font-semibold text-ink-deep">{p.page.title}</span>
                      <span className="flex items-center gap-1 text-[0.875rem] text-graphite">
                        {p.art.completedAt ? (
                          <>
                            <Star className="size-4 fill-sunflower text-sunflower" /> Finished
                          </>
                        ) : (
                          `${Math.round(p.art.progress * 100)}% colored`
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      <section id="stickers" aria-labelledby="stickers-h" className="mt-14 scroll-mt-6">
        <h2 id="stickers-h" className="font-display text-heading font-bold text-ink-deep">
          Stickers
        </h2>
        <p className="mt-1 text-graphite">
          {earned} of {insights.stickers.length} collected
        </p>
        <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-4 lg:grid-cols-6">
          {insights.stickers.map((s) => (
            <li key={s.id} className="flex justify-center">
              <StickerBadge sticker={s} />
            </li>
          ))}
        </ul>
      </section>

      {open ? <PictureViewer piece={open} colorUrl={thumbs.get(`${open.book.id}:${open.page.id}`)} onClose={() => setOpen(null)} /> : null}
    </main>
  )
}

function PictureViewer({ piece, colorUrl, onClose }: { piece: Piece; colorUrl?: string; onClose: () => void }) {
  const [saving, setSaving] = useState(false)
  const { art, book, page } = piece
  const updated = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' }).format(art.updatedAt)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function save() {
    setSaving(true)
    try {
      await downloadPicture({
        colorLayer: art.colorLayer,
        lineArt: page.image,
        width: book.pageSize.width,
        height: book.pageSize.height,
        fileName: `${book.title} - ${page.title}`,
      })
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-deep/70 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={page.title}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-full w-full max-w-4xl flex-col gap-5 overflow-y-auto rounded-[28px] bg-snow p-5 shadow-paper sm:flex-row sm:p-6"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-full bg-paper/90 text-graphite hover:bg-frost"
        >
          <X className="size-5" />
        </button>
        <div className="relative mx-auto aspect-[210/297] w-full max-w-[min(26rem,60dvh)] shrink-0 overflow-hidden rounded-[4px] bg-[#fffefb] shadow-paper sm:mx-0">
          {colorUrl ? <img src={colorUrl} alt="" className="absolute inset-0 size-full" /> : null}
          <img src={page.image} alt={`${page.title}, colored`} className="absolute inset-0 size-full" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="text-[0.9375rem] text-graphite">{book.title}</p>
          <h2 className="font-display text-title font-extrabold text-ink-deep">{page.title}</h2>
          <p className="mt-2 flex items-center gap-1.5 text-graphite">
            {art.completedAt ? (
              <>
                <Star className="size-4 fill-sunflower text-sunflower" /> Finished
              </>
            ) : (
              `${Math.round(art.progress * 100)}% colored`
            )}
          </p>
          <p className="text-[0.9375rem] text-graphite">Last colored {updated}</p>
          <div className="mt-6 flex flex-col gap-3 sm:mt-auto">
            <Link
              to={`/color/${book.id}/${page.id}`}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white shadow-lift active:scale-95"
            >
              <Paintbrush className="size-5" /> {art.completedAt ? 'Color some more' : 'Keep coloring'}
            </Link>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-paper px-6 font-semibold text-ink ring-2 ring-inset ring-mist hover:ring-ink/30"
            >
              {saving ? <Spinner /> : <Download className="size-5" />} Save picture
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
