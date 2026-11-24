import { hashSecret, PIN_ITERATIONS, verifySecret } from '../lib/crypto'
import { newId } from '../lib/id'
import { db } from './db'
import type { Account, Profile, PublicAccount } from './types'

export const MAX_PROFILES = 6
export const MIN_PASSWORD_LENGTH = 8

/** An error whose message is written for the person using the app. */
export class UserFacingError extends Error {
  readonly field?: string
  constructor(message: string, field?: string) {
    super(message)
    this.name = 'UserFacingError'
    this.field = field
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PIN_RE = /^\d{4}$/

export function toPublic(account: Account): PublicAccount {
  const { passwordHash: _p, parentPinHash: _q, ...rest } = account
  return rest
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function requirePin(pin: string, field = 'pin') {
  if (!PIN_RE.test(pin)) throw new UserFacingError('Use exactly 4 numbers for the PIN.', field)
}

// ── Accounts ────────────────────────────────────────────────────────────────

export interface SignUpInput {
  name: string
  email: string
  password: string
  parentPin: string
}

export async function signUp(input: SignUpInput): Promise<PublicAccount> {
  const name = input.name.trim()
  const email = normalizeEmail(input.email)
  if (!name) throw new UserFacingError('Enter your name.', 'name')
  if (!EMAIL_RE.test(email)) throw new UserFacingError('Enter an email like name@example.com.', 'email')
  if (input.password.length < MIN_PASSWORD_LENGTH)
    throw new UserFacingError(`Use at least ${MIN_PASSWORD_LENGTH} characters for the password.`, 'password')
  requirePin(input.parentPin, 'parentPin')

  if (await db.accounts.where('email').equals(email).count())
    throw new UserFacingError('An account with this email already exists on this device. Log in instead.', 'email')

  const [passwordHash, parentPinHash] = await Promise.all([
    hashSecret(input.password),
    hashSecret(input.parentPin, PIN_ITERATIONS),
  ])
  const now = Date.now()
  const isFirst = (await db.accounts.count()) === 0
  const account: Account = {
    id: newId(),
    email,
    name,
    passwordHash,
    parentPinHash,
    role: isFirst ? 'admin' : 'parent',
    createdAt: now,
    lastLoginAt: now,
  }
  await db.accounts.add(account)
  return toPublic(account)
}

export async function logIn(emailInput: string, password: string): Promise<PublicAccount> {
  const email = normalizeEmail(emailInput)
  const account = await db.accounts.where('email').equals(email).first()
  // Same message either way, so the form doesn't reveal which emails exist.
  const mismatch = new UserFacingError('That email and password don’t match an account on this device.')
  if (!account) throw mismatch
  if (!(await verifySecret(password, account.passwordHash))) throw mismatch
  const lastLoginAt = Date.now()
  await db.accounts.update(account.id, { lastLoginAt })
  return toPublic({ ...account, lastLoginAt })
}

export async function getAccount(id: string): Promise<PublicAccount | null> {
  const account = await db.accounts.get(id)
  return account ? toPublic(account) : null
}

export async function verifyParentPin(accountId: string, pin: string): Promise<boolean> {
  const account = await db.accounts.get(accountId)
  if (!account || !PIN_RE.test(pin)) return false
  return verifySecret(pin, account.parentPinHash)
}

export async function changeParentPin(accountId: string, currentPin: string, nextPin: string) {
  requirePin(nextPin, 'nextPin')
  if (!(await verifyParentPin(accountId, currentPin)))
    throw new UserFacingError('The current PIN isn’t right.', 'currentPin')
  await db.accounts.update(accountId, { parentPinHash: await hashSecret(nextPin, PIN_ITERATIONS) })
}

// ── Profiles ────────────────────────────────────────────────────────────────

export interface ProfileInput {
  name: string
  avatar: string
  color: string
  /** undefined keeps the current PIN, null removes it, a string sets it. */
  pin?: string | null
}

export function listProfiles(accountId: string): Promise<Profile[]> {
  return db.profiles.where('accountId').equals(accountId).sortBy('createdAt')
}

export async function createProfile(accountId: string, input: ProfileInput): Promise<Profile> {
  const name = input.name.trim()
  if (!name) throw new UserFacingError('Enter a name for this profile.', 'name')
  if ((await db.profiles.where('accountId').equals(accountId).count()) >= MAX_PROFILES)
    throw new UserFacingError(`A family can have up to ${MAX_PROFILES} profiles.`)
  if (input.pin) requirePin(input.pin)

  const profile: Profile = {
    id: newId(),
    accountId,
    name,
    avatar: input.avatar,
    color: input.color,
    pinHash: input.pin ? await hashSecret(input.pin, PIN_ITERATIONS) : null,
    createdAt: Date.now(),
    lastActiveAt: null,
  }
  await db.profiles.add(profile)
  return profile
}

export async function updateProfile(id: string, input: ProfileInput): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new UserFacingError('Enter a name for this profile.', 'name')
  const changes: Partial<Profile> = { name, avatar: input.avatar, color: input.color }
  if (input.pin === null) changes.pinHash = null
  else if (typeof input.pin === 'string') {
    requirePin(input.pin)
    changes.pinHash = await hashSecret(input.pin, PIN_ITERATIONS)
  }
  await db.profiles.update(id, changes)
}

/** Removes the profile together with its artwork and activity. */
export async function deleteProfile(id: string): Promise<void> {
  await db.transaction('rw', db.profiles, db.artworks, db.events, async () => {
    await db.artworks.where('profileId').equals(id).delete()
    await db.events.where('profileId').equals(id).delete()
    await db.profiles.delete(id)
  })
}

export async function verifyProfilePin(id: string, pin: string): Promise<boolean> {
  const profile = await db.profiles.get(id)
  if (!profile) return false
  if (!profile.pinHash) return true
  return PIN_RE.test(pin) && verifySecret(pin, profile.pinHash)
}

export async function touchProfile(id: string): Promise<void> {
  await db.profiles.update(id, { lastActiveAt: Date.now() })
}
