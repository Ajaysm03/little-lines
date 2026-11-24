import type { Book } from '../content/books'
import { newId } from '../lib/id'
import { db } from './db'
import type { StoredBook } from './types'

/** A page ready to store: the role it plays and its images. */
export interface NewPage {
  kind: 'front-cover' | 'line-art' | 'back-cover'
  title: string
  image: Blob
  thumb: Blob
}

export interface NewBook {
  title: string
  subtitle: string
  description: string
  ageRange: string
  tags: string[]
  theme: StoredBook['theme']
  pageSize: { width: number; height: number }
  pages: NewPage[]
  createdBy: string
}

/** Saves an imported book and its images in one transaction. Returns the new book id. */
export async function saveImportedBook(input: NewBook): Promise<string> {
  const id = `imported-${newId().slice(0, 8)}`
  const files: Array<{ key: string; bookId: string; blob: Blob }> = []
  const pages: StoredBook['pages'] = []
  let lineArt = 0
  // The import screen allows at most one front and one back cover, so these ids are unique.
  for (const p of input.pages) {
    const pageId = p.kind === 'line-art' ? `p${String(++lineArt).padStart(2, '0')}` : p.kind
    const image = `${id}/${pageId}`
    const thumb = `${id}/${pageId}-thumb`
    files.push({ key: image, bookId: id, blob: p.image }, { key: thumb, bookId: id, blob: p.thumb })
    pages.push({ id: pageId, kind: p.kind, title: p.title, image, thumb })
  }
  const cover = pages.find((p) => p.kind === 'front-cover') ?? pages[0]
  if (!cover) throw new Error('A book needs at least one page.')
  const book: StoredBook = {
    id,
    title: input.title.trim() || 'Untitled book',
    subtitle: input.subtitle.trim(),
    description: input.description.trim(),
    ageRange: input.ageRange.trim(),
    tags: input.tags,
    theme: input.theme,
    pageSize: input.pageSize,
    cover: cover.image,
    coverThumb: cover.thumb,
    pages,
    createdAt: Date.now(),
    createdBy: input.createdBy,
  }
  await db.transaction('rw', db.books, db.bookFiles, async () => {
    await db.bookFiles.bulkAdd(files)
    await db.books.add(book)
  })
  return id
}

/** Removes an imported book, its images, and every child's coloring of it. */
export async function deleteImportedBook(id: string): Promise<void> {
  await db.transaction('rw', db.books, db.bookFiles, db.artworks, async () => {
    await db.bookFiles.where('bookId').equals(id).delete()
    await db.artworks.filter((a) => a.bookId === id).delete()
    await db.books.delete(id)
  })
}

/**
 * Loads imported books as ordinary `Book`s whose images are object URLs.
 * Returns the URLs too, so the caller can revoke them when reloading.
 */
export async function loadImportedBooks(): Promise<{ books: Book[]; urls: string[] }> {
  const [stored, files] = await Promise.all([db.books.orderBy('createdAt').toArray(), db.bookFiles.toArray()])
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
