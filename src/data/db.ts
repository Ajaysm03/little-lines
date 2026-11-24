import Dexie, { type EntityTable } from 'dexie'
import type { Account, ActivityEvent, Artwork, BookFile, OutboxEntry, Profile, StoredBook } from './types'

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
  outbox!: EntityTable<OutboxEntry, 'key'>

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
    // v3: cloud sync. Accounts are now a cache of the signed-in family; events get
    // a cross-device id; changes queue in the outbox until they reach the server.
    this.version(3)
      .stores({
        accounts: 'id, email, createdAt',
        events: '++id, &uid, accountId, profileId, type, at, [profileId+at]',
        outbox: 'key, kind',
      })
      .upgrade(async (tx) => {
        // Local-only accounts from before sync can't sign in any more; start clean.
        await tx.table('accounts').clear()
        let n = 0
        await tx
          .table('events')
          .toCollection()
          .modify((e: { uid?: string }) => {
            e.uid ??= `legacy-${Date.now().toString(36)}-${n++}`
          })
      })
  }
}

export const db = new LittleLinesDB()
