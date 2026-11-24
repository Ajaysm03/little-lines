import { BUNDLED_BOOKS, isNewBook, type Book } from '../content/books'
import { catalogImageUrl, type CatalogBook, type CatalogStatus, type CatalogTier } from '../data/api'

/** One book as the owner console lists it: a catalog book, or a book that comes with the app. */
export interface AdminBookRow {
  id: string
  title: string
  subtitle: string
  origin: CatalogBook['origin']
  status: CatalogStatus
  tier: CatalogTier
  sortOrder: number
  publishedAt: number | null
  isNew: boolean
  category: string
  pagesToColor: number
  coverThumb: string
  /** Pages whose image or thumbnail never finished uploading. */
  missingImages: number
  catalog: CatalogBook | null
  bundled: Book | null
}

export function bookRows(catalog: CatalogBook[]): AdminBookRow[] {
  const byId = new Map(catalog.map((b) => [b.id, b]))
  const rows: AdminBookRow[] = BUNDLED_BOOKS.map((b, i) => {
    const s = byId.get(b.id)
    return {
      id: b.id,
      title: b.title,
      subtitle: b.subtitle,
      origin: 'bundled',
      status: s?.status ?? 'published',
      tier: s?.tier ?? 'free',
      sortOrder: s?.sortOrder ?? i - 1000,
      publishedAt: null,
      isNew: false,
      category: 'comes with the app',
      pagesToColor: b.pages.filter((p) => p.kind === 'line-art').length,
      coverThumb: b.coverThumb,
      missingImages: 0,
      catalog: s ?? null,
      bundled: b,
    }
  })
  for (const b of catalog) {
    if (b.origin === 'bundled' || !b.meta) continue
    const cover = b.pages.find((p) => p.kind === 'front-cover') ?? b.pages[0]
    rows.push({
      id: b.id,
      title: b.meta.title,
      subtitle: b.meta.subtitle,
      origin: b.origin,
      status: b.status,
      tier: b.tier,
      sortOrder: b.sortOrder,
      publishedAt: b.publishedAt,
      isNew: b.status === 'published' && isNewBook(b),
      category: b.meta.category,
      pagesToColor: b.pages.filter((p) => p.kind === 'line-art').length,
      coverThumb: cover ? catalogImageUrl(b.id, `${cover.id}-thumb`, b.version) : '',
      missingImages: missingImages(b).length,
      catalog: b,
      bundled: null,
    })
  }
  return rows.sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Pages of a catalog book without both images uploaded. */
export function missingImages(b: CatalogBook) {
  const have = new Set(b.images ?? [])
  return b.pages.filter((p) => !have.has(`${b.id}/${p.id}`) || !have.has(`${b.id}/${p.id}-thumb`))
}

export const STATUS_LABEL: Record<CatalogStatus, string> = { draft: 'Draft', published: 'Published', archived: 'Archived' }

/** The ids of bundled books mapped to their titles, which the server needs to make settings rows for them. */
export function bundledTitles(): Record<string, string> {
  return Object.fromEntries(BUNDLED_BOOKS.map((b) => [b.id, b.title]))
}
