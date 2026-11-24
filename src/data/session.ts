/**
 * Who is signed in on this device, kept in localStorage so a refresh keeps you
 * logged in. Storage can be unavailable (private mode, blocked site data), so
 * every access is guarded and the app falls back to the login screen.
 */
const KEY = 'little-lines:session'

export interface StoredSession {
  accountId: string
  profileId: string | null
}

export function readSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredSession>
    if (typeof parsed.accountId !== 'string') return null
    return { accountId: parsed.accountId, profileId: typeof parsed.profileId === 'string' ? parsed.profileId : null }
  } catch {
    return null
  }
}

export function writeSession(session: StoredSession | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session))
    else localStorage.removeItem(KEY)
  } catch {
    // Not fatal: the session just won't survive a reload.
  }
}
