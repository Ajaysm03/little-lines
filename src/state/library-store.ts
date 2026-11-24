import { create } from 'zustand'
import { BUNDLED_BOOKS, type Book } from '../content/books'
import { loadImportedBooks } from '../data/imported-books'

/**
 * Every book on this device: the bundled ones plus any imported from PDFs.
 * Imported page images are object URLs, created on load and revoked on reload.
 */
interface LibraryState {
  imported: Book[]
  books: Book[]
  loaded: boolean
  load(accountId?: string | null): Promise<void>
}

let liveUrls: string[] = []
let currentAccount: string | null = null

export const useLibrary = create<LibraryState>((set) => ({
  imported: [],
  books: BUNDLED_BOOKS,
  loaded: false,
  async load(accountId) {
    if (accountId !== undefined) currentAccount = accountId
    try {
      const { books, urls } = await loadImportedBooks(currentAccount)
      const old = liveUrls
      liveUrls = urls
      set({ imported: books, books: [...BUNDLED_BOOKS, ...books], loaded: true })
      // Let any screen still showing the old images re-render first.
      setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 2000)
    } catch {
      set({ loaded: true })
    }
  },
}))

/** All books, bundled first. */
export function useBooks(): Book[] {
  return useLibrary((s) => s.books)
}

/** Looks a book up among bundled and imported books. */
export function getBook(id: string): Book | undefined {
  return useLibrary.getState().books.find((b) => b.id === id)
}

/** Same as getBook, but re-renders when the library changes. */
export function useBook(id: string | undefined): Book | undefined {
  return useLibrary((s) => (id ? s.books.find((b) => b.id === id) : undefined))
}
