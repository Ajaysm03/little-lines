import type { Book } from '../content/books'

/*
 * Books families imported from PDFs before only the owner could add books.
 * Importing has moved to the owner console; the server moves these books into
 * the catalog as drafts and the family copies are removed on the next sync.
 * Until then they stay readable here.
 */
import { db } from './db'

/**
 * Loads imported books as ordinary `Book`s whose images are object URLs.
 * Returns the URLs too, so the caller can revoke them when reloading.
 */
export async function loadImportedBooks(accountId: string | null): Promise<{ books: Book[]; urls: string[] }> {
  if (!accountId) return { books: [], urls: [] }
  const stored = (await db.books.orderBy('createdAt').toArray()).filter((b) => b.createdBy === accountId)
  const ids = new Set(stored.map((b) => b.id))
  const files = (await db.bookFiles.toArray()).filter((f) => ids.has(f.bookId))
  const blobs = new Map(files.map((f) => [f.key, f.blob]))
  const urls: string[] = []
  const urlFor = (key: string) => {
    const blob = blobs.get(key)
    if (!blob) return ''
    const u = URL.createObjectURL(blob)
    urls.push(u)
    return u
  }
  const books = stored.map<Book>((s) => {
    const pages = s.pages.map((p) => ({ id: p.id, kind: p.kind, title: p.title, image: urlFor(p.image), thumb: urlFor(p.thumb) }))
    const cover = pages.find((p) => p.kind === 'front-cover') ?? pages[0]
    return {
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      description: s.description,
      ageRange: s.ageRange,
      tags: s.tags,
      theme: s.theme,
      origin: 'imported',
      pageSize: s.pageSize,
      cover: cover?.image ?? '',
      coverThumb: cover?.thumb ?? '',
      pages,
    }
  })
  return { books, urls }
}
