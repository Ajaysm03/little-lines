import bundled from './generated/books.json'
import type { Season } from './scenes'

export type PageKind = 'front-cover' | 'line-art' | 'back-cover'

export interface BookPage {
  id: string
  kind: PageKind
  title: string
  /** Full-size image: colored cover art, or black line art on transparency. */
  image: string
  thumb: string
}

export interface BookTheme {
  accent: string
  deep: string
  glow: string
  palette: string[]
}

export interface Book {
  id: string
  title: string
  subtitle: string
  description: string
  ageRange: string
  tags: string[]
  theme: BookTheme
  /** bundled: comes with the app. catalog: added by the owner. imported: an older family PDF import still on this device. */
  origin: 'bundled' | 'catalog' | 'imported'
  /** Premium books are locked for families on the Free plan (Phase C). */
  tier?: 'free' | 'premium'
  /** When the owner published it; books published in the last 14 days are "New". */
  publishedAt?: number | null
  category?: string
  /** Which set of scenes the book's screens use (falls back to winter until a set exists). */
  season?: Season
  pageSize: { width: number; height: number }
  cover: string
  coverThumb: string
  pages: BookPage[]
}

/** Built by `npm run assets` from the art folders next to the app. Imported books are added by the library store. */
export const BUNDLED_BOOKS = bundled as Book[]

const NEW_FOR_MS = 14 * 24 * 60 * 60 * 1000

export function isNewBook(book: Pick<Book, 'publishedAt'>, now = Date.now()): boolean {
  return !!book.publishedAt && now - book.publishedAt < NEW_FOR_MS
}

export function colorablePages(book: Book): BookPage[] {
  return book.pages.filter((p) => p.kind === 'line-art')
}
