import Dexie, { type EntityTable } from 'dexie'
import type { Account, ActivityEvent, Artwork, BookFile, Profile, StoredBook } from './types'

/**
 * Everything lives in this browser's IndexedDB. All reads and writes go through
 * the modules in src/data, so moving to a hosted backend later only touches them.
 */
export class LittleLinesDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  profiles!: EntityTable<Profile, 'id'>
  artworks!: EntityTable<Artwork, 'id'>
  events!: EntityTable<ActivityEvent, 'id'>
  books!: EntityTable<StoredBook, 'id'>
  bookFiles!: EntityTable<BookFile, 'key'>

  constructor(name = 'little-lines') {
    super(name)
    this.version(1).stores({
      accounts: 'id, &email, createdAt',
      profiles: 'id, accountId, createdAt',
      artworks: 'id, profileId, [profileId+bookId], updatedAt',
      events: '++id, accountId, profileId, type, at, [profileId+at]',
    })
    // v2: books imported from PDFs, and their page images.
    this.version(2).stores({
      books: 'id, createdAt',
      bookFiles: 'key, bookId',
    })
  }
}

export const db = new LittleLinesDB()
