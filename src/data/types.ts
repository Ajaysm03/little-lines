/** owner: runs Little Lines (the console). parent: a family's grown-up. */
export type Role = 'owner' | 'parent'

/**
 * The signed-in family, cached on the device so the app works offline. Sign-in
 * itself (password, Google, reset) is handled by the server.
 */
export interface Account {
  /** The server's user id. */
  id: string
  email: string
  name: string
  /** 4-digit PIN that unlocks the grown-ups area; null until set (e.g. after a Google sign-up). */
  parentPinHash: string | null
  role: Role
  /** The owner signs in with a username too; grown-ups use their email. */
  username?: string | null
  /** "password", "google". */
  signInMethods?: string[]
  createdAt: number
  lastLoginAt: number
}

/** What the UI holds in memory: no hashes. */
export type PublicAccount = Omit<Account, 'parentPinHash'> & { hasParentPin: boolean }

export interface Profile {
  id: string
  accountId: string
  name: string
  avatar: string
  color: string
  /** Optional 4-digit PIN a child enters to open their own profile. */
  pinHash: string | null
  createdAt: number
  lastActiveAt: number | null
  /** Last change, for syncing between devices. */
  updatedAt?: number
}

/** One child's coloring of one page. Filled in from Phase 3. */
export interface Artwork {
  /** `${profileId}:${bookId}:${pageId}` */
  id: string
  profileId: string
  bookId: string
  pageId: string
  colorLayer: Blob | null
  thumb: Blob | null
  /** 0–1 share of the page's colorable area that has color. */
  progress: number
  completedAt: number | null
  /** The child said "I'm finished", so erasing a little doesn't un-finish the page. */
  finishedByChild?: boolean
  updatedAt: number
}

/** Activity log behind the dashboards. Filled in from Phase 5. */
export interface ActivityEvent {
  id?: number
  /** Unique across devices, so synced events are never doubled. */
  uid?: string
  accountId: string
  profileId: string | null
  type: string
  bookId?: string
  pageId?: string
  at: number
  data?: Record<string, unknown>
}

/** A book imported from a PDF on this device. Images live in `bookFiles` as blobs. */
export interface StoredBook {
  id: string
  title: string
  subtitle: string
  description: string
  ageRange: string
  tags: string[]
  theme: { accent: string; deep: string; glow: string; palette: string[] }
  pageSize: { width: number; height: number }
  /** File keys for the cover and its thumbnail. */
  cover: string
  coverThumb: string
  pages: Array<{ id: string; kind: 'front-cover' | 'line-art' | 'back-cover'; title: string; image: string; thumb: string }>
  createdAt: number
  /** The family (account id) the book belongs to. */
  createdBy: string
  updatedAt?: number
}

export interface BookFile {
  key: string
  bookId: string
  blob: Blob
}

/** A change waiting to be sent to the server. One entry per thing, so repeated edits collapse. */
export interface OutboxEntry {
  key: string
  kind: 'profile' | 'artwork' | 'event' | 'book'
  ref: string
  at: number
}
