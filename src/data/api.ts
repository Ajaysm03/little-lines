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

export interface ServerFamily {
  id: string
  email: string
  name: string
  /** Only the owner has one; grown-ups sign in with their email. */
  username: string | null
  role: 'owner' | 'parent'
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
  adminOverview: () => request<AdminOverview>('/api/admin/overview'),
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
    case 'TOO_MANY_REQUESTS':
      return 'Too many tries. Wait a minute, then try again.'
  }
  if (error?.status === 0 || error?.status === undefined) return 'Couldn’t reach the server. Check your internet connection and try again.'
  return error?.message || 'Something went wrong. Try again.'
}
