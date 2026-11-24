export type Role = 'admin' | 'parent'

/** A grown-up's sign-in. One per family; children use profiles under it. */
export interface Account {
  id: string
  /** Stored lower-cased; unique on this device. */
  email: string
  name: string
  passwordHash: string
  /** 4-digit PIN that unlocks the grown-ups area. */
  parentPinHash: string
  /** The first account created on a device is the admin. */
  role: Role
  createdAt: number
  lastLoginAt: number
}

/** What the UI holds in memory: no hashes. */
export type PublicAccount = Omit<Account, 'passwordHash' | 'parentPinHash'>

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
  createdBy: string
}

export interface BookFile {
  key: string
  bookId: string
  blob: Blob
}
