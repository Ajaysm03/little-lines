import { create } from 'zustand'
import { BUNDLED_BOOKS, type Book } from '../content/books'
import { api, catalogImageUrl, type CatalogBook, type FamilyCatalog } from '../data/api'
import { loadImportedBooks } from '../data/imported-books'

/**
 * Every book a family can open: the ones that come with the app and the ones
 * the owner published, in the owner's order. The catalog is fetched from the
 * server and kept in localStorage so the library opens offline; its page images
 * are cached by the service worker. Books a family imported before importing
 * moved to the owner stay visible until the server moves them to the catalog.
 */
interface LibraryState {
  imported: Book[]
  catalog: FamilyCatalog | null
  books: Book[]
  loaded: boolean
  load(accountId?: string | null): Promise<void>
  /** Fetches the published catalog again (on open, and when the app comes back to the front). */
  refreshCatalog(): Promise<void>
}

const CACHE_KEY = 'll:catalog:v1'
const REFRESH_MS = 2 * 60 * 1000

let liveUrls: string[] = []
let currentAccount: string | null = null
let lastRefresh = 0

function readCache(): FamilyCatalog | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as FamilyCatalog) : null
  } catch {
    return null
  }
}

function writeCache(c: FamilyCatalog) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c))
  } catch {
    /* storage full or blocked: the next refresh tries again */
  }
}

/** A catalog book as the reader, library and coloring screens expect it. */
export function catalogToBook(b: CatalogBook): Book | null {
  if (!b.meta) return null
  const pages = b.pages.map((p) => ({
    id: p.id,
    kind: p.kind,
    title: p.title,
    image: catalogImageUrl(b.id, p.id, b.version),
    thumb: catalogImageUrl(b.id, `${p.id}-thumb`, b.version),
  }))
  const cover = pages.find((p) => p.kind === 'front-cover') ?? pages[0]
  const m = b.meta
  return {
    id: b.id,
    title: m.title,
    subtitle: m.subtitle,
    description: m.description,
    ageRange: m.ageRange,
    tags: m.tags,
    theme: { ...m.theme, palette: m.theme.palette.length ? m.theme.palette : BUNDLED_BOOKS[0].theme.palette },
    origin: 'catalog',
    pageSize: m.pageSize,
    cover: cover?.image ?? '',
    coverThumb: cover?.thumb ?? '',
    pages,
    tier: b.tier,
    publishedAt: b.publishedAt,
    category: m.category,
    season: m.season ?? 'winter',
  }
}

/** Bundled books (unless the owner hid them) and published catalog books, in the owner's order; old family imports last. */
export function mergeLibrary(catalog: FamilyCatalog | null, imported: Book[]): Book[] {
  const settings = new Map((catalog?.bundled ?? []).map((b) => [b.id, b]))
  const entries: Array<{ book: Book; order: number }> = []
  BUNDLED_BOOKS.forEach((b, i) => {
    const s = settings.get(b.id)
    if (s && s.status !== 'published') return
    entries.push({ book: { ...b, tier: s?.tier ?? 'free', publishedAt: null }, order: s?.sortOrder ?? i - 1000 })
  })
  for (const c of catalog?.books ?? []) {
    const book = catalogToBook(c)
    if (book) entries.push({ book, order: c.sortOrder })
  }
  entries.sort((a, b) => a.order - b.order)
  const ids = new Set(entries.map((e) => e.book.id))
  return [...entries.map((e) => e.book), ...imported.filter((b) => !ids.has(b.id))]
}

export const useLibrary = create<LibraryState>((set, get) => ({
  imported: [],
  catalog: null,
  books: mergeLibrary(readCache(), []),
  loaded: false,
  async load(accountId) {
    if (accountId !== undefined) currentAccount = accountId
    const catalog = get().catalog ?? readCache()
    try {
      const { books, urls } = await loadImportedBooks(currentAccount)
      const old = liveUrls
      liveUrls = urls
      set({ imported: books, catalog, books: mergeLibrary(catalog, books), loaded: true })
      // Let any screen still showing the old images re-render first.
      setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 2000)
    } catch {
      set({ catalog, books: mergeLibrary(catalog, get().imported), loaded: true })
    }
    if (currentAccount) void get().refreshCatalog()
  },
  async refreshCatalog() {
    if (!currentAccount) return
    lastRefresh = Date.now()
    try {
      const catalog = await api.catalog()
      writeCache(catalog)
      set({ catalog, books: mergeLibrary(catalog, get().imported) })
    } catch {
      /* offline or signed out: keep the cached catalog */
    }
  },
}))

if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh > REFRESH_MS) void useLibrary.getState().refreshCatalog()
  })
}

/** All books, in library order. */
export function useBooks(): Book[] {
  return useLibrary((s) => s.books)
}

/** Looks a book up among bundled, catalog and imported books. */
export function getBook(id: string): Book | undefined {
  return useLibrary.getState().books.find((b) => b.id === id)
}

/** Same as getBook, but re-renders when the library changes. */
export function useBook(id: string | undefined): Book | undefined {
  return useLibrary((s) => (id ? s.books.find((b) => b.id === id) : undefined))
}
