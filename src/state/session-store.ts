import { create } from 'zustand'
import * as accounts from '../data/accounts'
import { api, authClient, authErrorMessage } from '../data/api'
import { readSession, writeSession } from '../data/session'
import type { PublicAccount } from '../data/types'
import { onBooksChanged, startSync } from '../sync/sync'
import { useLibrary } from './library-store'

/** How long the grown-ups area stays open after entering the parent PIN. */
const PARENT_UNLOCK_MS = 10 * 60 * 1000
/** Wrong PIN attempts allowed before a short cool-down. */
const MAX_PIN_FAILS = 5
const PIN_COOLDOWN_MS = 30 * 1000

type Status = 'loading' | 'signed-out' | 'signed-in'

interface PinLock {
  fails: number
  until: number
}

export interface SignUpInput {
  name: string
  email: string
  password: string
  parentPin: string
}

interface SessionState {
  status: Status
  account: PublicAccount | null
  profileId: string | null
  parentUnlockedUntil: number
  pinLocks: Record<string, PinLock>

  init(): Promise<void>
  signUp(input: SignUpInput): Promise<void>
  /** `login` is an email, or the owner's username. */
  logIn(login: string, password: string): Promise<void>
  /** Leaves for Google's sign-in page; comes back to the app signed in. */
  logInWithGoogle(): Promise<void>
  logOut(): Promise<void>
  /** Saves the parent PIN (new Google accounts choose one after signing in). */
  setParentPin(pin: string): Promise<void>
  selectProfile(profileId: string): Promise<void>
  leaveProfile(): void
  checkPin(key: string, verify: () => Promise<boolean>): Promise<'ok' | 'wrong' | 'locked'>
  unlockParent(pin: string): Promise<'ok' | 'wrong' | 'locked'>
  lockParent(): void
  /** Grown-ups are still using it: push the unlock expiry forward. */
  extendParent(): void
}

export class AuthError extends Error {}

/**
 * Loads the family from the server and starts syncing. `pickProfile` runs before
 * the app is told it's signed in, so a restored child profile is in place before
 * any screen decides where to go.
 */
async function enter(
  set: (s: Partial<SessionState>) => void,
  pickProfile: (accountId: string) => Promise<string | null> = async () => null,
) {
  const family = await api.me()
  const account = await accounts.saveFamily(family)
  const profileId = await pickProfile(account.id)
  writeSession({ accountId: account.id, profileId })
  set({ status: 'signed-in', account, profileId })
  void useLibrary.getState().load(account.id)
  startSync(account.id)
}

let booksListener: (() => void) | null = null

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  account: null,
  profileId: null,
  parentUnlockedUntil: 0,
  pinLocks: {},

  async init() {
    booksListener ??= onBooksChanged(() => void useLibrary.getState().load())
    const stored = readSession()
    // Only restore a child profile that still exists and has no PIN to re-enter.
    const restoreProfile = async (accountId: string) => {
      if (!stored?.profileId) return null
      const list = await accounts.listProfiles(accountId)
      const p = list.find((x) => x.id === stored.profileId)
      return p && !p.pinHash ? p.id : null
    }
    try {
      const { data, error } = await authClient.getSession()
      if (error && error.status !== 401) throw error
      if (!data) {
        writeSession(null)
        startSync(null)
        set({ status: 'signed-out', account: null, profileId: null })
        return
      }
      await enter(set, restoreProfile)
    } catch {
      // Offline: carry on with this device's copy of the last signed-in family.
      const account = stored ? await accounts.getAccount(stored.accountId) : null
      if (!account) return set({ status: 'signed-out' })
      set({ status: 'signed-in', account, profileId: await restoreProfile(account.id) })
      void useLibrary.getState().load(account.id)
      startSync(account.id)
    }
  },

  async signUp({ name, email, password, parentPin }) {
    const { error } = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
    if (error) throw new AuthError(authErrorMessage(error))
    await enter(set)
    const account = await accounts.setParentPin(get().account!.id, parentPin)
    // Choosing the PIN just now counts as unlocking the grown-ups area.
    set({ account, parentUnlockedUntil: Date.now() + PARENT_UNLOCK_MS })
  },

  async logIn(login, password) {
    const id = login.trim()
    const { error } = id.includes('@')
      ? await authClient.signIn.email({ email: id, password })
      : await authClient.signIn.username({ username: id.toLowerCase(), password })
    if (error) throw new AuthError(authErrorMessage(error))
    set({ parentUnlockedUntil: 0 })
    await enter(set)
  },

  async logInWithGoogle() {
    const origin = window.location.origin
    const { error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: `${origin}/`,
      errorCallbackURL: `${origin}/welcome?error=google`,
    })
    if (error) throw new AuthError(authErrorMessage(error))
  },

  async logOut() {
    startSync(null)
    await authClient.signOut().catch(() => {})
    writeSession(null)
    void useLibrary.getState().load(null)
    set({ status: 'signed-out', account: null, profileId: null, parentUnlockedUntil: 0 })
  },

  async setParentPin(pin) {
    const account = get().account
    if (!account) throw new AuthError('Log in first.')
    const next = await accounts.setParentPin(account.id, pin)
    set({ account: next, parentUnlockedUntil: Date.now() + PARENT_UNLOCK_MS })
  },

  async selectProfile(profileId) {
    const account = get().account
    if (!account) return
    await accounts.touchProfile(profileId)
    writeSession({ accountId: account.id, profileId })
    // Switching to a child closes the grown-ups area.
    set({ profileId, parentUnlockedUntil: 0 })
  },

  leaveProfile() {
    const account = get().account
    if (account) writeSession({ accountId: account.id, profileId: null })
    set({ profileId: null })
  },

  async checkPin(key, verify) {
    const lock = get().pinLocks[key]
    if (lock && lock.until > Date.now()) return 'locked'
    const ok = await verify()
    if (ok) {
      set((s) => ({ pinLocks: { ...s.pinLocks, [key]: { fails: 0, until: 0 } } }))
      return 'ok'
    }
    const fails = (lock?.until && lock.until <= Date.now() ? 0 : (lock?.fails ?? 0)) + 1
    const until = fails >= MAX_PIN_FAILS ? Date.now() + PIN_COOLDOWN_MS : 0
    set((s) => ({ pinLocks: { ...s.pinLocks, [key]: { fails: until ? 0 : fails, until } } }))
    return until ? 'locked' : 'wrong'
  },

  async unlockParent(pin) {
    const account = get().account
    if (!account) return 'wrong'
    const result = await get().checkPin('parent', () => accounts.verifyParentPin(account.id, pin))
    if (result === 'ok') set({ parentUnlockedUntil: Date.now() + PARENT_UNLOCK_MS })
    return result
  },

  lockParent() {
    set({ parentUnlockedUntil: 0 })
  },

  extendParent() {
    if (get().parentUnlockedUntil > Date.now()) set({ parentUnlockedUntil: Date.now() + PARENT_UNLOCK_MS })
  },
}))

export function isParentUnlocked(state: Pick<SessionState, 'parentUnlockedUntil'>): boolean {
  return state.parentUnlockedUntil > Date.now()
}
