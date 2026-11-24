import { create } from 'zustand'
import * as accounts from '../data/accounts'
import { readSession, writeSession } from '../data/session'
import type { PublicAccount } from '../data/types'

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

interface SessionState {
  status: Status
  account: PublicAccount | null
  profileId: string | null
  parentUnlockedUntil: number
  pinLocks: Record<string, PinLock>

  init(): Promise<void>
  signUp(input: accounts.SignUpInput): Promise<void>
  logIn(email: string, password: string): Promise<void>
  logOut(): void
  selectProfile(profileId: string): Promise<void>
  leaveProfile(): void
  /** Checks a PIN with a cool-down after repeated misses. `key` scopes the counter. */
  checkPin(key: string, verify: () => Promise<boolean>): Promise<'ok' | 'wrong' | 'locked'>
  unlockParent(pin: string): Promise<'ok' | 'wrong' | 'locked'>
  lockParent(): void
}

export const useSession = create<SessionState>((set, get) => ({
  status: 'loading',
  account: null,
  profileId: null,
  parentUnlockedUntil: 0,
  pinLocks: {},

  async init() {
    const stored = readSession()
    if (!stored) return set({ status: 'signed-out' })
    const account = await accounts.getAccount(stored.accountId).catch(() => null)
    if (!account) {
      writeSession(null)
      return set({ status: 'signed-out' })
    }
    // Only restore the child profile if it still exists and has no PIN to re-enter.
    let profileId: string | null = null
    if (stored.profileId) {
      const list = await accounts.listProfiles(account.id)
      const p = list.find((x) => x.id === stored.profileId)
      if (p && !p.pinHash) profileId = p.id
    }
    writeSession({ accountId: account.id, profileId })
    set({ status: 'signed-in', account, profileId })
  },

  async signUp(input) {
    const account = await accounts.signUp(input)
    writeSession({ accountId: account.id, profileId: null })
    // Creating the account just set the parent PIN, so the grown-ups area starts unlocked.
    set({ status: 'signed-in', account, profileId: null, parentUnlockedUntil: Date.now() + PARENT_UNLOCK_MS })
  },

  async logIn(email, password) {
    const account = await accounts.logIn(email, password)
    writeSession({ accountId: account.id, profileId: null })
    set({ status: 'signed-in', account, profileId: null, parentUnlockedUntil: 0 })
  },

  logOut() {
    writeSession(null)
    set({ status: 'signed-out', account: null, profileId: null, parentUnlockedUntil: 0 })
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
}))

export function isParentUnlocked(state: Pick<SessionState, 'parentUnlockedUntil'>): boolean {
  return state.parentUnlockedUntil > Date.now()
}
