import { colorablePages, type Book } from '../content/books'
import type { Artwork } from './types'

export type BookStatus = 'new' | 'in-progress' | 'finished'

export interface BookProgress {
  total: number
  started: number
  finished: number
  status: BookStatus
  /** 0–1, averaged over every colorable page. */
  fraction: number
}

/** Rolls one child's artworks up into progress for a book. */
export function bookProgress(book: Book, artworks: Artwork[]): BookProgress {
  const pages = colorablePages(book)
  const byPage = new Map(artworks.filter((a) => a.bookId === book.id).map((a) => [a.pageId, a]))
  let started = 0
  let finished = 0
  let sum = 0
  for (const p of pages) {
    const art = byPage.get(p.id)
    if (!art) continue
    if (art.completedAt) finished++
    else if (art.progress > 0) started++
    sum += art.completedAt ? 1 : Math.min(1, Math.max(0, art.progress))
  }
  const total = pages.length
  const status: BookStatus = total > 0 && finished === total ? 'finished' : started + finished > 0 ? 'in-progress' : 'new'
  return { total, started, finished, status, fraction: total ? sum / total : 0 }
}

export function progressLabel(p: BookProgress): string {
  if (p.status === 'finished') return 'Finished'
  if (p.status === 'new') return `${p.total} pages to color`
  return `${p.finished} of ${p.total} pages done`
}
