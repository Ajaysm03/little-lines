import { hashSecret, PIN_ITERATIONS, verifySecret } from '../lib/crypto'
import { newId } from '../lib/id'
import { enqueue } from '../sync/sync'
import { api, type ServerFamily } from './api'
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

const PIN_RE = /^\d{4}$/

export function toPublic(account: Account): PublicAccount {
  const { parentPinHash, ...rest } = account
  return { ...rest, hasParentPin: Boolean(parentPinHash) }
}

function requirePin(pin: string, field = 'pin') {
  if (!PIN_RE.test(pin)) throw new UserFacingError('Use exactly 4 numbers for the PIN.', field)
}

// ── The signed-in family ───────────────────────────────────────────────────

/** Stores the family the server returned, so it is available offline. */
export async function saveFamily(f: ServerFamily): Promise<PublicAccount> {
  const prev = await db.accounts.get(f.id)
  const account: Account = {
    id: f.id,
    email: f.email,
    name: f.name,
    parentPinHash: f.parentPinHash,
    role: f.role,
    signInMethods: f.signInMethods,
    createdAt: f.createdAt,
    lastLoginAt: prev?.lastLoginAt ?? Date.now(),
  }
  await db.accounts.put(account)
  return toPublic(account)
}

export async function getAccount(id: string): Promise<PublicAccount | null> {
  const account = await db.accounts.get(id)
  return account ? toPublic(account) : null
}

export async function verifyParentPin(accountId: string, pin: string): Promise<boolean> {
  const account = await db.accounts.get(accountId)
  if (!account?.parentPinHash || !PIN_RE.test(pin)) return false
  return verifySecret(pin, account.parentPinHash)
}

/** Sets the parent PIN on the server and on this device. Needs a connection. */
export async function setParentPin(accountId: string, pin: string): Promise<PublicAccount> {
  requirePin(pin, 'parentPin')
  const hash = await hashSecret(pin, PIN_ITERATIONS)
  const family = await api.setParentPin(hash)
  if (family.id !== accountId) throw new UserFacingError('You were signed out. Log in again.')
  return saveFamily(family)
}

export async function changeParentPin(accountId: string, currentPin: string, nextPin: string) {
  requirePin(nextPin, 'nextPin')
  if (!(await verifyParentPin(accountId, currentPin)))
    throw new UserFacingError('The current PIN isn’t right.', 'currentPin')
  await setParentPin(accountId, nextPin)
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

  const now = Date.now()
  const profile: Profile = {
    id: newId(),
    accountId,
    name,
    avatar: input.avatar,
    color: input.color,
    pinHash: input.pin ? await hashSecret(input.pin, PIN_ITERATIONS) : null,
    createdAt: now,
    lastActiveAt: null,
    updatedAt: now,
  }
  await db.profiles.add(profile)
  await enqueue('profile', profile.id)
  return profile
}

export async function updateProfile(id: string, input: ProfileInput): Promise<void> {
  const name = input.name.trim()
  if (!name) throw new UserFacingError('Enter a name for this profile.', 'name')
  const changes: Partial<Profile> = { name, avatar: input.avatar, color: input.color, updatedAt: Date.now() }
  if (input.pin === null) changes.pinHash = null
  else if (typeof input.pin === 'string') {
    requirePin(input.pin)
    changes.pinHash = await hashSecret(input.pin, PIN_ITERATIONS)
  }
  await db.profiles.update(id, changes)
  await enqueue('profile', id)
}

/** Removes the profile together with its artwork and activity, here and on the server. */
export async function deleteProfile(id: string): Promise<void> {
  const artworks = await db.artworks.where('profileId').equals(id).primaryKeys()
  await db.transaction('rw', db.profiles, db.artworks, db.events, async () => {
    await db.artworks.where('profileId').equals(id).delete()
    await db.events.where('profileId').equals(id).delete()
    await db.profiles.delete(id)
  })
  await enqueue('profile', id)
  for (const a of artworks) await enqueue('artwork', String(a))
}

export async function verifyProfilePin(id: string, pin: string): Promise<boolean> {
  const profile = await db.profiles.get(id)
  if (!profile) return false
  if (!profile.pinHash) return true
  return PIN_RE.test(pin) && verifySecret(pin, profile.pinHash)
}

export async function touchProfile(id: string): Promise<void> {
  const now = Date.now()
  await db.profiles.update(id, { lastActiveAt: now, updatedAt: now })
  await enqueue('profile', id)
}
