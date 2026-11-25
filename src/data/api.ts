import { usernameClient } from 'better-auth/client/plugins'
import { createAuthClient } from 'better-auth/react'

/** Sign-in (email or the owner's username), sign-up, Google, sign-out and password reset (Better Auth, at /api/auth). */
export const authClient = createAuthClient({ plugins: [usernameClient({ displayUsername: false })] })

/** An error whose message is written for the person using the app. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, { credentials: 'include', ...init })
  } catch {
    throw new ApiError(0, 'You’re offline. Connect to the internet and try again.')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new ApiError(res.status, body.error ?? `The server answered ${res.status}.`)
  }
  return (await res.json()) as T
}

function sendJson<T>(method: string, path: string, body: unknown) {
  return request<T>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

export type CatalogStatus = 'draft' | 'published' | 'archived'
export type CatalogTier = 'free' | 'premium'

export interface CatalogPage {
  id: string
  kind: 'front-cover' | 'line-art' | 'back-cover'
  title: string
}

export interface CatalogMeta {
  title: string
  subtitle: string
  description: string
  category: string
  ageRange: string
  tags: string[]
  /** Older books saved before seasons existed have none; treat as winter. */
  season?: 'winter' | 'spring' | 'summer' | 'autumn'
  theme: { accent: string; deep: string; glow: string; palette: string[] }
  pageSize: { width: number; height: number }
}

export interface CatalogBook {
  id: string
  origin: 'upload' | 'family-import' | 'bundled'
  status: CatalogStatus
  tier: CatalogTier
  sortOrder: number
  version: number
  createdAt: number
  updatedAt: number
  publishedAt: number | null
  sourceUserId?: string | null
  /** null for books that come with the app. */
  meta: CatalogMeta | null
  pages: CatalogPage[]
  /** Owner only: uploaded image keys ("bookId/pageId", "bookId/pageId-thumb"). */
  images?: string[]
}

export interface FamilyCatalog {
  books: CatalogBook[]
  bundled: Array<{ id: string; status: CatalogStatus; tier: CatalogTier; sortOrder: number; publishedAt: number | null }>
}

/** Where a catalog page image is served; the version makes a changed image a new URL (cached for good). */
export function catalogImageUrl(bookId: string, key: string, version: number): string {
  return `/api/catalog/image?key=${encodeURIComponent(`${bookId}/${key}`)}&v=${version}`
}

export interface EmailPrefs {
  weekly: boolean
  news: boolean
}

export type EmailKind = 'welcome' | 'weekly' | 'new_book' | 'password_reset' | 'test'

export interface EmailOverview {
  configured: boolean
  from: string
  cronConfigured: boolean
  counts: Array<{ kind: EmailKind; status: 'sent' | 'logged' | 'failed'; n: number }>
  subscribers: { families: number; weekly: number; news: number }
  log: Array<{ id: number; userId: string | null; kind: EmailKind; ref: string | null; to: string; subject: string; status: 'sent' | 'logged' | 'failed'; error: string | null; at: number }>
}

export type PlanName = 'free' | 'trial' | 'premium'

export interface FamilyPlan {
  plan: PlanName
  /** What the family gets right now (Free once a Trial or Premium plan has ended). */
  effective: PlanName
  startedAt: number | null
  endsAt: number | null
  note: string | null
  updatedAt: number | null
}

export interface PlanRow extends FamilyPlan {
  id: string
  name: string
  email: string
  joinedAt: number
}

export interface Analytics {
  from: number
  to: number
  totals: { families: number; newFamilies: number; activeToday: number; activeWeek: number; activeMonth: number; pagesFinished: number; coloringMs: number }
  planMix: Record<PlanName, number>
  /** One per day in the range, oldest first; `day` is that day's local midnight. */
  days: Array<{ day: number; signups: number; activeFamilies: number; coloringMs: number; pagesFinished: number }>
  books: Array<{ bookId: string; opens: number; families: number; children: number; coloringMs: number; pagesStarted: number; pagesFinished: number }>
  pages: Array<{ bookId: string; pageId: string; opens: number; coloringMs: number }>
}

export type UserStatus = 'active' | 'inactive' | 'never-started' | 'suspended'

export interface AdminUser {
  id: string
  name: string
  email: string
  joinedAt: number
  lastLoginAt: number | null
  lastColoringAt: number | null
  status: UserStatus
  suspendedAt: number | null
  suspendedReason: string | null
  children: number
  pagesColored: number
  pagesFinished: number
  coloringMs: number
  signInMethods: string[]
  plan: FamilyPlan
}

export interface AdminUserDetail extends Omit<AdminUser, 'children'> {
  children: Array<{
    id: string
    name: string
    avatar: string
    color: string
    hasPin: boolean
    createdAt: number
    lastActiveAt: number | null
    pagesColored: number
    pagesFinished: number
    coloringMs: number
  }>
  activity: Array<{ type: string; profileId: string | null; bookId: string | null; pageId: string | null; at: number; ms: number | null }>
  books: Array<{ bookId: string; pagesColored: number; pagesFinished: number; lastAt: number }>
}

export interface ServerFamily {
  id: string
  email: string
  name: string
  /** Only the owner has one; grown-ups sign in with their email. */
  username: string | null
  role: 'owner' | 'parent'
  /** The family's plan; null for the owner. */
  plan: FamilyPlan | null
  /** Which optional emails the family gets. */
  emailPrefs?: EmailPrefs
  parentPinHash: string | null
  createdAt: number
  signInMethods: string[]
}

export const api = {
  config: () => request<{ google: boolean }>('/api/config'),
  me: () => request<ServerFamily>('/api/me'),
  setParentPin: (parentPinHash: string) =>
    request<ServerFamily>('/api/me/pin', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parentPinHash }),
    }),
  pull: (since: number) => request<PullResponse>(`/api/sync?since=${since}`),
  push: (body: PushBody) =>
    request<{ accepted: number }>('/api/sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  putBlob: (key: string, blob: Blob) =>
    request<{ ok: true }>(`/api/blob?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'image/png' },
      body: blob,
    }),
  getBlob: async (key: string): Promise<Blob | null> => {
    const res = await fetch(`/api/blob?key=${encodeURIComponent(key)}`, { credentials: 'include' })
    if (res.status === 404) return null
    if (!res.ok) throw new ApiError(res.status, 'Could not download an image')
    return res.blob()
  },
  catalog: () => request<FamilyCatalog>('/api/catalog'),
  adminOverview: () => request<AdminOverview>('/api/admin/overview'),
  setEmailPrefs: (prefs: Partial<EmailPrefs>) => sendJson<EmailPrefs>('PUT', '/api/me/email-prefs', prefs),
  adminEmails: () => request<EmailOverview>('/api/admin/emails'),
  adminEmailPreview: (kind: 'welcome' | 'weekly' | 'new_book', bookId?: string) =>
    request<{ subject: string; html: string; text: string }>(`/api/admin/emails/preview?kind=${kind}${bookId ? `&bookId=${encodeURIComponent(bookId)}` : ''}`),
  adminEmailTest: (kind: 'welcome' | 'weekly' | 'new_book', bookId?: string) =>
    sendJson<{ status: 'sent' | 'logged'; to: string }>('POST', '/api/admin/emails/test', { kind, bookId }),
  adminSendWeekly: () => sendJson<{ sent: number; skipped: number; failed: number }>('POST', '/api/admin/emails/weekly-digest', {}),
  adminAnnounceStatus: (bookId: string) => request<{ announcedAt: number | null; sentTo: number; recipients: number }>(`/api/admin/books/${bookId}/announce`),
  adminAnnounce: (bookId: string) => sendJson<{ sent: number; failed: number; skipped: number }>('POST', `/api/admin/books/${bookId}/announce`, {}),
  adminAnalytics: (from: number, to: number) =>
    request<Analytics>(`/api/admin/analytics?from=${from}&to=${to}&tz=${new Date().getTimezoneOffset()}`),
  adminUsers: () => request<{ users: AdminUser[]; inactiveAfterDays: number }>('/api/admin/users'),
  adminUser: (id: string) => request<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
  adminSuspend: (id: string, reason: string) => sendJson<AdminUserDetail>('POST', `/api/admin/users/${encodeURIComponent(id)}/suspend`, { reason }),
  adminReactivate: (id: string) => sendJson<AdminUserDetail>('POST', `/api/admin/users/${encodeURIComponent(id)}/reactivate`, {}),
  adminSendReset: (id: string) => sendJson<{ ok: true }>('POST', `/api/admin/users/${encodeURIComponent(id)}/password-reset`, {}),
  adminDeleteUser: (id: string, confirmEmail: string) => sendJson<{ ok: true }>('DELETE', `/api/admin/users/${encodeURIComponent(id)}`, { confirmEmail }),
  adminPlans: () => request<{ trialDays: number; families: PlanRow[] }>('/api/admin/plans'),
  adminSetPlan: (userId: string, body: { plan: PlanName; endsAt: number | null; note: string }) =>
    sendJson<FamilyPlan>('PUT', `/api/admin/families/${encodeURIComponent(userId)}/plan`, body),
  adminSetTrialDays: (trialDays: number) => sendJson<{ trialDays: number }>('PUT', '/api/admin/settings/trial-days', { trialDays }),
  adminBooks: () => request<{ books: CatalogBook[]; categories: string[] }>('/api/admin/books'),
  adminBook: (id: string) => request<CatalogBook>(`/api/admin/books/${id}`),
  adminCreateBook: (body: { meta: CatalogMeta; pages: CatalogPage[] }) => sendJson<CatalogBook>('POST', '/api/admin/books', body),
  adminUpdateBook: (id: string, body: { meta?: CatalogMeta; pages?: CatalogPage[] }) => sendJson<CatalogBook>('PUT', `/api/admin/books/${id}`, body),
  adminBookImage: (id: string, key: string, blob: Blob) =>
    request<{ ok: true }>(`/api/admin/books/${id}/image?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'content-type': blob.type || 'image/webp' },
      body: blob,
    }),
  adminBookStatus: (id: string, status: CatalogStatus, bundledTitle?: string) =>
    sendJson<CatalogBook>('PUT', `/api/admin/books/${id}/status`, { status, bundledTitle }),
  adminBookTier: (id: string, tier: CatalogTier, bundledTitle?: string) => sendJson<CatalogBook>('PUT', `/api/admin/books/${id}/tier`, { tier, bundledTitle }),
  adminBookOrder: (ids: string[], bundled: Record<string, string>) => sendJson<{ ok: true }>('PUT', '/api/admin/books/order', { ids, bundled }),
  adminDeleteBook: (id: string, confirmTitle: string) => sendJson<{ ok: true }>('DELETE', `/api/admin/books/${id}`, { confirmTitle }),
  adminAudit: (q: { before?: number; action?: string; limit?: number } = {}) => {
    const params = new URLSearchParams()
    if (q.before) params.set('before', String(q.before))
    if (q.action) params.set('action', q.action)
    if (q.limit) params.set('limit', String(q.limit))
    return request<{ entries: AuditEntry[]; nextBefore: number | null }>(`/api/admin/audit?${params}`)
  },
}

export interface RemoteProfile {
  id: string
  name: string
  avatar: string
  color: string
  pinHash: string | null
  createdAt: number
  lastActiveAt: number | null
  updatedAt: number
  deleted: boolean
}

export interface RemoteArtwork {
  id: string
  profileId: string
  bookId: string
  pageId: string
  progress: number
  completedAt: number | null
  finishedByChild: boolean
  hasLayer: boolean
  updatedAt: number
  deleted: boolean
}

export interface RemoteEvent {
  uid: string
  profileId: string | null
  type: string
  bookId?: string
  pageId?: string
  at: number
  data?: Record<string, unknown>
}

export interface RemoteBook {
  id: string
  meta: Record<string, unknown>
  updatedAt: number
  deleted: boolean
}

export interface PullResponse {
  cursor: number
  profiles: RemoteProfile[]
  artworks: RemoteArtwork[]
  events: RemoteEvent[]
  books: RemoteBook[]
}

export interface PushBody {
  profiles?: Array<Omit<RemoteProfile, 'deleted'> & { deleted?: boolean }>
  artworks?: Array<Omit<RemoteArtwork, 'deleted'> & { deleted?: boolean }>
  events?: RemoteEvent[]
  books?: RemoteBook[]
}

export interface AdminOverview {
  families: Array<{ id: string; name: string; email: string; role: 'owner' | 'parent'; createdAt: number; lastLoginAt: number }>
  profiles: Array<{ id: string; accountId: string }>
  events: Array<{ accountId: string; profileId: string | null; type: string; bookId?: string; pageId?: string; at: number; data?: Record<string, unknown> }>
  pagesFinished: number
}

export interface AuditEntry {
  id: number
  actorId: string | null
  actorLabel: string
  action: string
  targetType: string | null
  targetId: string | null
  summary: string
  before: unknown
  after: unknown
  context: { ip?: string; browser?: string } | null
  at: number
}

/** Friendly words for Better Auth's error codes. */
export function authErrorMessage(error: { code?: string; message?: string; status?: number } | null | undefined): string {
  switch (error?.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
    case 'INVALID_PASSWORD':
    case 'INVALID_EMAIL':
      return 'That email and password don’t match an account.'
    case 'INVALID_USERNAME_OR_PASSWORD':
    case 'INVALID_USERNAME':
      return 'That username and password don’t match an account.'
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account with this email already exists. Log in instead, or reset the password.'
    case 'PASSWORD_TOO_SHORT':
      return 'Use at least 8 characters for the password.'
    case 'PASSWORD_TOO_LONG':
      return 'That password is too long. Use 128 characters or fewer.'
    case 'INVALID_TOKEN':
      return 'This reset link has expired or was already used. Ask for a new one.'
    case 'ACCOUNT_SUSPENDED':
      return 'This account is suspended. Contact Little Lines for help.'
    case 'TOO_MANY_REQUESTS':
      return 'Too many tries. Wait a minute, then try again.'
  }
  if (error?.status === 0 || error?.status === undefined) return 'Couldn’t reach the server. Check your internet connection and try again.'
  return error?.message || 'Something went wrong. Try again.'
}
