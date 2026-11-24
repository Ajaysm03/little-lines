import bundled from './generated/books.json'

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
  origin: 'bundled' | 'imported'
  pageSize: { width: number; height: number }
  cover: string
  coverThumb: string
  pages: BookPage[]
}

/** Built by `npm run assets` from the art folders next to the app. Imported books join in Phase 6. */
export const BUNDLED_BOOKS = bundled as Book[]

export function getBook(id: string): Book | undefined {
  return BUNDLED_BOOKS.find((b) => b.id === id)
}

export function colorablePages(book: Book): BookPage[] {
  return book.pages.filter((p) => p.kind === 'line-art')
}
