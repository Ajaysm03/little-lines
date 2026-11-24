import { audit } from './audit.js'
import { query } from './db.js'

/**
 * The book catalog the owner runs. A catalog book has details, an ordered list of
 * pages and page images (WebP in the database, served at /api/catalog/image).
 * Families see published books only. Books that come with the app ("bundled")
 * keep their pages in the app; a catalog row for one only holds the owner's
 * settings for it (published or hidden, Free or Premium, place in the library).
 */

export const CATALOG_SCHEMA = `
create table if not exists app_catalog_book (
  id text primary key,
  origin text not null default 'upload',
  status text not null default 'draft',
  tier text not null default 'free',
  sort_order integer not null default 0,
  meta jsonb not null default '{}',
  version integer not null default 1,
  source_user_id text,
  created_at bigint not null,
  updated_at bigint not null,
  published_at bigint
);
create table if not exists app_catalog_page (
  book_id text not null references app_catalog_book(id) on delete cascade,
  id text not null,
  position integer not null,
  kind text not null,
  title text not null,
  primary key (book_id, id)
);
create table if not exists app_catalog_blob (
  key text primary key,
  book_id text not null references app_catalog_book(id) on delete cascade,
  content_type text not null,
  data bytea not null,
  updated_at bigint not null
);
create index if not exists app_catalog_blob_book on app_catalog_blob (book_id);
`

export type Status = 'draft' | 'published' | 'archived'
export type Tier = 'free' | 'premium'
export type PageKind = 'front-cover' | 'line-art' | 'back-cover'

export interface CatalogPage {
  id: string
  kind: PageKind
  title: string
}

/** The parts of a book the owner edits. Pages are separate. */
export interface BookMeta {
  title: string
  subtitle: string
  description: string
  category: string
  ageRange: string
  tags: string[]
  theme: { accent: string; deep: string; glow: string; palette: string[] }
  pageSize: { width: number; height: number }
}

export interface CatalogBook {
  id: string
  origin: 'upload' | 'family-import' | 'bundled'
  status: Status
  tier: Tier
  sortOrder: number
  version: number
  createdAt: number
  updatedAt: number
  publishedAt: number | null
  sourceUserId: string | null
  meta: BookMeta | null
  pages: CatalogPage[]
  /** Owner view only: which page images have been uploaded. */
  images?: string[]
}

export class CatalogError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const STATUSES: Status[] = ['draft', 'published', 'archived']
const TIERS: Tier[] = ['free', 'premium']
const KINDS: PageKind[] = ['front-cover', 'line-art', 'back-cover']
export const CATEGORIES = ['Holidays', 'Animals', 'Nature', 'Fantasy', 'Vehicles', 'Everyday', 'Other']
const ID = /^[a-z0-9][a-z0-9-]{1,63}$/
const PAGE_ID = /^(p\d{2,3}|front-cover|back-cover)$/
const HEX = /^#[0-9a-f]{6}$/i

const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Cleans up book details from the browser; throws on anything unusable. */
export function cleanMeta(v: unknown): BookMeta {
  const m = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const theme = (m.theme && typeof m.theme === 'object' ? m.theme : {}) as Record<string, unknown>
  const size = (m.pageSize && typeof m.pageSize === 'object' ? m.pageSize : {}) as Record<string, unknown>
  const color = (c: unknown, fallback: string) => (typeof c === 'string' && HEX.test(c) ? c : fallback)
  const title = s(m.title, 80)
  if (!title) throw new CatalogError(400, 'Give the book a title.')
  const category = s(m.category, 30)
  return {
    title,
    subtitle: s(m.subtitle, 120),
    description: s(m.description, 1000),
    category: CATEGORIES.includes(category) ? category : 'Other',
    ageRange: s(m.ageRange, 20),
    tags: Array.isArray(m.tags) ? m.tags.map((t) => s(t, 30)).filter(Boolean).slice(0, 8) : [],
    theme: {
      accent: color(theme.accent, '#2b2f6b'),
      deep: color(theme.deep, '#1b1e45'),
      glow: color(theme.glow, '#f2c230'),
      palette: Array.isArray(theme.palette) ? theme.palette.filter((c): c is string => typeof c === 'string' && HEX.test(c)).slice(0, 24) : [],
    },
    pageSize: {
      width: Math.max(100, Math.min(10000, Math.round(Number(size.width) || 1600))),
      height: Math.max(100, Math.min(10000, Math.round(Number(size.height) || 2263))),
    },
  }
}

/** Cleans up a page list: known ids and kinds, at most one front and one back cover, no repeats. */
export function cleanPages(v: unknown): CatalogPage[] {
  if (!Array.isArray(v)) throw new CatalogError(400, 'Pages are missing.')
  const seen = new Set<string>()
  const pages: CatalogPage[] = []
  for (const raw of v.slice(0, 200)) {
    const p = (raw ?? {}) as Record<string, unknown>
    const id = s(p.id, 20)
    const kind = p.kind as PageKind
    if (!PAGE_ID.test(id) || !KINDS.includes(kind) || seen.has(id)) throw new CatalogError(400, `Page "${id}" isn’t valid.`)
    if ((kind === 'front-cover' || kind === 'back-cover') && id !== kind) throw new CatalogError(400, 'Covers must use the ids front-cover and back-cover.')
    if (kind === 'line-art' && !id.startsWith('p')) throw new CatalogError(400, 'Coloring pages use ids like p01.')
    seen.add(id)
    pages.push({ id, kind, title: s(p.title, 80) || (kind === 'line-art' ? 'Untitled page' : kind === 'front-cover' ? 'Front cover' : 'Back cover') })
  }
  // Reading order: front cover first, back cover last.
  const rank = (k: PageKind) => (k === 'front-cover' ? 0 : k === 'back-cover' ? 2 : 1)
  return pages.map((p, i) => ({ p, i })).sort((a, b) => rank(a.p.kind) - rank(b.p.kind) || a.i - b.i).map((x) => x.p)
}

function rowToBook(r: Record<string, unknown>, pages: CatalogPage[]): CatalogBook {
  return {
    id: r.id as string,
    origin: r.origin as CatalogBook['origin'],
    status: r.status as Status,
    tier: r.tier as Tier,
    sortOrder: Number(r.sort_order),
    version: Number(r.version),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    publishedAt: r.published_at == null ? null : Number(r.published_at),
    sourceUserId: (r.source_user_id as string | null) ?? null,
    meta: r.origin === 'bundled' ? null : (r.meta as BookMeta),
    pages,
  }
}

async function loadBooks(where: string, params: unknown[], withImages = false): Promise<CatalogBook[]> {
  const books = await query(`select * from app_catalog_book ${where} order by sort_order, created_at`, params)
  if (!books.rows.length) return []
  const ids = books.rows.map((b) => b.id as string)
  const pages = await query<{ book_id: string; id: string; kind: PageKind; title: string }>(
    'select book_id, id, kind, title from app_catalog_page where book_id = any($1) order by position',
    [ids],
  )
  const byBook = new Map<string, CatalogPage[]>()
  for (const p of pages.rows) byBook.set(p.book_id, [...(byBook.get(p.book_id) ?? []), { id: p.id, kind: p.kind, title: p.title }])
  let images = new Map<string, string[]>()
  if (withImages) {
    const blobs = await query<{ book_id: string; key: string }>('select book_id, key from app_catalog_blob where book_id = any($1)', [ids])
    images = new Map()
    for (const b of blobs.rows) images.set(b.book_id, [...(images.get(b.book_id) ?? []), b.key])
  }
  return books.rows.map((r) => ({ ...rowToBook(r, byBook.get(r.id as string) ?? []), ...(withImages ? { images: images.get(r.id as string) ?? [] } : {}) }))
}

export async function getBook(id: string): Promise<CatalogBook> {
  const [book] = await loadBooks('where id = $1', [id], true)
  if (!book) throw new CatalogError(404, 'That book doesn’t exist.')
  return book
}

/** What families get: published books (with pages) and the owner's settings for bundled books. */
export async function familyCatalog() {
  const books = await loadBooks(`where status = 'published' or origin = 'bundled'`, [])
  return {
    books: books.filter((b) => b.origin !== 'bundled').map(({ sourceUserId: _s, ...b }) => b),
    bundled: books.filter((b) => b.origin === 'bundled').map((b) => ({ id: b.id, status: b.status, tier: b.tier, sortOrder: b.sortOrder, publishedAt: b.publishedAt })),
  }
}

/** Everything, for the owner console. */
export async function ownerCatalog() {
  return { books: await loadBooks('', [], true), categories: CATEGORIES }
}

interface Actor {
  id: string
  label: string
}

async function nextSortOrder(): Promise<number> {
  const { rows } = await query<{ n: number | null }>('select max(sort_order) as n from app_catalog_book')
  return (rows[0]?.n ?? 0) + 1
}

async function writePages(bookId: string, pages: CatalogPage[]) {
  await query('delete from app_catalog_page where book_id = $1', [bookId])
  for (const [i, p] of pages.entries())
    await query('insert into app_catalog_page (book_id, id, position, kind, title) values ($1,$2,$3,$4,$5)', [bookId, p.id, i, p.kind, p.title])
  // Images of pages that were removed go too.
  const keep = pages.flatMap((p) => [`${bookId}/${p.id}`, `${bookId}/${p.id}-thumb`])
  await query('delete from app_catalog_blob where book_id = $1 and not (key = any($2))', [bookId, keep])
}

/** A new draft from an uploaded PDF. Images are uploaded next, one request per image. */
export async function createBook(actor: Actor, body: { meta?: unknown; pages?: unknown }): Promise<CatalogBook> {
  const meta = cleanMeta(body.meta)
  const pages = cleanPages(body.pages)
  if (!pages.some((p) => p.kind === 'line-art')) throw new CatalogError(400, 'A book needs at least one page to color.')
  const id = `book-${slug(meta.title)}-${Math.random().toString(36).slice(2, 7)}`
  const now = Date.now()
  await query(
    `insert into app_catalog_book (id, origin, status, tier, sort_order, meta, version, created_at, updated_at)
     values ($1, 'upload', 'draft', 'free', $2, $3, 1, $4, $4)`,
    [id, await nextSortOrder(), JSON.stringify(meta), now],
  )
  await writePages(id, pages)
  await audit({ actorId: actor.id, actorLabel: actor.label, action: 'book.created', targetType: 'book', targetId: id, summary: `Uploaded “${meta.title}” as a draft (${pages.filter((p) => p.kind === 'line-art').length} pages to color)`, after: { title: meta.title, pages: pages.length } })
  return getBook(id)
}

export async function putImage(bookId: string, key: string, type: string, data: Buffer) {
  if (!/^image\/(webp|png|jpeg)$/.test(type)) throw new CatalogError(415, 'Only WebP, PNG or JPEG images.')
  const pageId = key.replace(/-thumb$/, '')
  if (!PAGE_ID.test(pageId)) throw new CatalogError(400, 'Bad image name.')
  const book = await query<{ origin: string }>('select origin from app_catalog_book where id = $1', [bookId])
  if (!book.rows[0] || book.rows[0].origin === 'bundled') throw new CatalogError(404, 'That book doesn’t exist.')
  // A new cover can be uploaded before it's added to the page list; other pages must exist.
  const page = await query('select 1 from app_catalog_page where book_id = $1 and id = $2', [bookId, pageId])
  if (!page.rowCount && pageId !== 'front-cover' && pageId !== 'back-cover') throw new CatalogError(404, 'That page isn’t in the book.')
  const full = `${bookId}/${key}`
  await query(
    `insert into app_catalog_blob (key, book_id, content_type, data, updated_at) values ($1,$2,$3,$4,$5)
     on conflict (key) do update set content_type = excluded.content_type, data = excluded.data, updated_at = excluded.updated_at`,
    [full, bookId, type, data, Date.now()],
  )
  await query('update app_catalog_book set version = version + 1, updated_at = $2 where id = $1', [bookId, Date.now()])
}

/**
 * A page image. Drafts are the owner's only. Pages of Premium books are refused
 * to families on Free ("locked"), except the covers, which the library shows.
 */
export async function getImage(key: string, viewer: { isOwner: boolean; plan: string }): Promise<{ type: string; data: Buffer } | 'locked' | null> {
  const { rows } = await query<{ content_type: string; data: Buffer; status: string; tier: string }>(
    `select b.content_type, b.data, k.status, k.tier from app_catalog_blob b join app_catalog_book k on k.id = b.book_id where b.key = $1`,
    [key],
  )
  const r = rows[0]
  if (!r || (r.status !== 'published' && !viewer.isOwner)) return null
  const cover = /\/(front-cover|back-cover)(-thumb)?$/.test(key)
  if (r.tier === 'premium' && viewer.plan === 'free' && !viewer.isOwner && !cover) return 'locked'
  return { type: r.content_type, data: r.data }
}

/** Saves details and the page list (titles, order, removals). */
export async function updateBook(actor: Actor, id: string, body: { meta?: unknown; pages?: unknown }): Promise<CatalogBook> {
  const before = await getBook(id)
  if (before.origin === 'bundled') throw new CatalogError(400, 'Books that come with the app can’t be edited, only published, hidden or reordered.')
  const meta = body.meta === undefined ? before.meta! : cleanMeta(body.meta)
  const pages = body.pages === undefined ? before.pages : cleanPages(body.pages)
  if (!pages.some((p) => p.kind === 'line-art')) throw new CatalogError(400, 'A book needs at least one page to color.')
  const unknown = pages.filter((p) => !before.pages.some((b) => b.id === p.id) && !(before.images ?? []).includes(`${id}/${p.id}`))
  if (unknown.some((p) => p.kind === 'line-art')) throw new CatalogError(400, 'New coloring pages can’t be added here; upload the PDF again.')
  await query('update app_catalog_book set meta = $2, version = version + 1, updated_at = $3 where id = $1', [id, JSON.stringify(meta), Date.now()])
  await writePages(id, pages)

  const changed: string[] = []
  for (const k of ['title', 'subtitle', 'description', 'category', 'ageRange'] as const) if (before.meta![k] !== meta[k]) changed.push(k === 'ageRange' ? 'ages' : k)
  if (before.meta!.tags.join() !== meta.tags.join()) changed.push('topics')
  const removed = before.pages.filter((p) => !pages.some((x) => x.id === p.id))
  const renamed = pages.filter((p) => before.pages.some((b) => b.id === p.id && b.title !== p.title))
  const order = (list: CatalogPage[]) => list.map((p) => p.id).join()
  const kept = (list: CatalogPage[]) => list.filter((p) => pages.some((x) => x.id === p.id) && before.pages.some((x) => x.id === p.id))
  if (order(kept(before.pages)) !== order(kept(pages))) changed.push('page order')
  if (removed.length) changed.push(`${removed.length} page${removed.length === 1 ? '' : 's'} removed`)
  if (renamed.length) changed.push(`${renamed.length} page${renamed.length === 1 ? '' : 's'} renamed`)
  if (pages.some((p) => p.kind === 'front-cover') && !before.pages.some((p) => p.kind === 'front-cover')) changed.push('cover added')
  if (changed.length)
    await audit({
      actorId: actor.id,
      actorLabel: actor.label,
      action: 'book.updated',
      targetType: 'book',
      targetId: id,
      summary: `Edited “${meta.title}”: ${changed.join(', ')}`,
      before: { title: before.meta!.title, pages: before.pages.length, removed: removed.map((p) => p.title).join(', ') || undefined },
      after: { title: meta.title, pages: pages.length },
    })
  return getBook(id)
}

/** Publish, unpublish (back to draft) or archive. Bundled books get a settings row on first change. */
export async function setStatus(actor: Actor, id: string, status: unknown, bundledTitle?: string): Promise<CatalogBook> {
  if (!STATUSES.includes(status as Status)) throw new CatalogError(400, 'Unknown status.')
  const next = status as Status
  const now = Date.now()
  let book = await getBook(id).catch(() => null)
  if (!book && bundledTitle) book = await ensureBundled(id)
  if (!book) throw new CatalogError(404, 'That book doesn’t exist.')
  if (book.origin === 'bundled' && next === 'archived') throw new CatalogError(400, 'Books that come with the app can be hidden but not archived.')
  if (next === 'published' && book.origin !== 'bundled') {
    const lineArt = book.pages.filter((p) => p.kind === 'line-art')
    if (!lineArt.length) throw new CatalogError(400, 'Add at least one page to color before publishing.')
    const missing = book.pages.filter((p) => !(book!.images ?? []).includes(`${id}/${p.id}`) || !(book!.images ?? []).includes(`${id}/${p.id}-thumb`))
    if (missing.length) throw new CatalogError(400, `Some page images are missing (${missing.map((p) => p.title).join(', ')}). Upload the PDF again.`)
  }
  if (book.status === next) return book
  await query(
    `update app_catalog_book set status = $2, updated_at = $3, version = version + 1,
       published_at = case when $2 = 'published' and published_at is null then $3 else published_at end
     where id = $1`,
    [id, next, now],
  )
  const title = book.meta?.title ?? bundledTitle ?? id
  const verb = next === 'published' ? 'Published' : next === 'archived' ? 'Archived' : book.origin === 'bundled' ? 'Hid' : 'Unpublished'
  await audit({ actorId: actor.id, actorLabel: actor.label, action: `book.${next === 'draft' ? 'unpublished' : next}`, targetType: 'book', targetId: id, summary: `${verb} “${title}”`, before: { status: book.status }, after: { status: next } })
  return getBook(id)
}

export async function setTier(actor: Actor, id: string, tier: unknown, bundledTitle?: string): Promise<CatalogBook> {
  if (!TIERS.includes(tier as Tier)) throw new CatalogError(400, 'Tier must be free or premium.')
  let book = await getBook(id).catch(() => null)
  if (!book && bundledTitle) book = await ensureBundled(id)
  if (!book) throw new CatalogError(404, 'That book doesn’t exist.')
  if (book.tier === tier) return book
  await query('update app_catalog_book set tier = $2, updated_at = $3, version = version + 1 where id = $1', [id, tier, Date.now()])
  const title = book.meta?.title ?? bundledTitle ?? id
  await audit({ actorId: actor.id, actorLabel: actor.label, action: 'book.tier_changed', targetType: 'book', targetId: id, summary: `“${title}” is now ${tier === 'premium' ? 'Premium' : 'Free'}`, before: { tier: book.tier }, after: { tier } })
  return getBook(id)
}

async function ensureBundled(id: string): Promise<CatalogBook> {
  if (!ID.test(id)) throw new CatalogError(400, 'Bad book id.')
  const now = Date.now()
  // Bundled books start first in the library, in the app's own order.
  const { rows } = await query<{ n: number | null }>('select min(sort_order) as n from app_catalog_book')
  await query(
    `insert into app_catalog_book (id, origin, status, tier, sort_order, meta, version, created_at, updated_at, published_at)
     values ($1, 'bundled', 'published', 'free', $2, '{}', 1, $3, $3, 0) on conflict (id) do nothing`,
    [id, Math.min(0, (rows[0]?.n ?? 0) - 1), now],
  )
  return getBook(id)
}

/** The library order, as a list of ids (bundled books included). */
export async function setOrder(actor: Actor, ids: unknown, bundled: Record<string, string>): Promise<void> {
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== 'string')) throw new CatalogError(400, 'Send the book ids in order.')
  for (const id of ids as string[]) if (bundled[id]) await ensureBundled(id)
  for (const [i, id] of (ids as string[]).entries()) await query('update app_catalog_book set sort_order = $2, version = version + 1 where id = $1', [id, i + 1])
  await audit({ actorId: actor.id, actorLabel: actor.label, action: 'book.reordered', targetType: 'library', summary: 'Changed the order of the library', after: { order: (ids as string[]).join(', ') } })
}

/** Deletes a draft or archived book for good, with everything in it. */
export async function deleteBook(actor: Actor, id: string, confirmTitle: unknown): Promise<void> {
  const book = await getBook(id)
  if (book.origin === 'bundled') throw new CatalogError(400, 'Books that come with the app can’t be deleted.')
  if (book.status === 'published') throw new CatalogError(400, 'Unpublish or archive the book before deleting it.')
  if (typeof confirmTitle !== 'string' || confirmTitle.trim() !== book.meta!.title) throw new CatalogError(400, 'Type the book’s title exactly to confirm.')
  await query('delete from app_catalog_book where id = $1', [id])
  await audit({ actorId: actor.id, actorLabel: actor.label, action: 'book.deleted', targetType: 'book', targetId: id, summary: `Deleted “${book.meta!.title}” permanently`, before: { title: book.meta!.title, status: book.status, pages: book.pages.length } })
}

/**
 * Books families imported themselves (before only the owner could add books)
 * become catalog drafts with the same id, so children's coloring still matches
 * once the owner publishes them. The family copies are then removed: their
 * devices drop the book on the next sync (their coloring stays).
 */
export async function moveFamilyImports(log: (m: string) => void = () => {}): Promise<number> {
  const { rows } = await query<{ id: string; user_id: string; meta: Record<string, unknown>; updated_at: string }>(
    `select b.id, b.user_id, b.meta, b.updated_at from app_book b
     where not b.deleted and not exists (select 1 from app_catalog_book c where c.id = b.id)`,
  )
  let moved = 0
  for (const r of rows) {
    const now = Date.now()
    let meta: BookMeta
    let pages: CatalogPage[]
    try {
      meta = cleanMeta({ ...r.meta, category: 'Other' })
      pages = cleanPages(r.meta.pages)
    } catch (err) {
      log(`Skipped family book ${r.id}: ${err instanceof Error ? err.message : err}`)
      continue
    }
    await query(
      `insert into app_catalog_book (id, origin, status, tier, sort_order, meta, version, source_user_id, created_at, updated_at)
       values ($1, 'family-import', 'draft', 'free', $2, $3, 1, $4, $5, $5)`,
      [r.id, await nextSortOrder(), JSON.stringify(meta), r.user_id, now],
    )
    for (const [i, p] of pages.entries())
      await query('insert into app_catalog_page (book_id, id, position, kind, title) values ($1,$2,$3,$4,$5)', [r.id, p.id, i, p.kind, p.title])
    await query(
      `insert into app_catalog_blob (key, book_id, content_type, data, updated_at)
       select substr(key, 6), $1, content_type, data, updated_at from app_blob where key like $2 on conflict (key) do nothing`,
      [r.id, `book:${r.id}/%`],
    )
    await query(`update app_book set deleted = true, updated_at = $2, server_at = $2 where id = $1`, [r.id, now])
    await query(`delete from app_blob where key like $1`, [`book:${r.id}/%`])
    await audit({
      actorId: null,
      actorLabel: 'System',
      action: 'book.moved_from_family',
      targetType: 'book',
      targetId: r.id,
      summary: `“${meta.title}”, imported by a family, is now a draft in the catalog`,
      after: { title: meta.title, family: r.user_id, pages: pages.length },
    })
    moved++
  }
  if (moved) log(`Moved ${moved} family-imported book(s) into the catalog as drafts`)
  return moved
}

function slug(t: string) {
  return (
    t
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'book'
  )
}
