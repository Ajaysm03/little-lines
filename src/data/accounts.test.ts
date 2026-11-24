import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSession } from '../state/session-store'
import * as accounts from './accounts'
import { api, type ServerFamily } from './api'
import { db } from './db'

const family: ServerFamily = {
  id: 'user-1',
  email: 'parent@example.test',
  name: 'Ajay',
  role: 'parent',
  username: null,
  plan: null,
  parentPinHash: null,
  createdAt: 1,
  signInMethods: ['password'],
}

beforeEach(() => {
  vi.restoreAllMocks()
  // The server echoes the PIN hash it is given.
  vi.spyOn(api, 'setParentPin').mockImplementation(async (parentPinHash) => ({ ...family, parentPinHash }))
})

describe('the signed-in family', () => {
  it('caches the server family on the device without exposing the PIN hash', async () => {
    const pub = await accounts.saveFamily(family)
    expect(pub).toMatchObject({ id: 'user-1', role: 'parent', hasParentPin: false })
    expect(pub).not.toHaveProperty('parentPinHash')
    expect(await accounts.getAccount('user-1')).toMatchObject({ email: 'parent@example.test' })
  })

  it('sets, checks and changes the parent PIN, storing only a hash', async () => {
    await accounts.saveFamily(family)
    const pub = await accounts.setParentPin('user-1', '2468')
    expect(pub.hasParentPin).toBe(true)
    expect((await db.accounts.get('user-1'))?.parentPinHash).not.toContain('2468')
    expect(await accounts.verifyParentPin('user-1', '2468')).toBe(true)
    expect(await accounts.verifyParentPin('user-1', '1111')).toBe(false)
    await accounts.changeParentPin('user-1', '2468', '1357')
    expect(await accounts.verifyParentPin('user-1', '1357')).toBe(true)
    await expect(accounts.changeParentPin('user-1', '0000', '9999')).rejects.toMatchObject({ field: 'currentPin' })
    await expect(accounts.setParentPin('user-1', '12a4')).rejects.toMatchObject({ field: 'parentPin' })
  })

  it('treats a family without a PIN as locked', async () => {
    await accounts.saveFamily(family)
    expect(await accounts.verifyParentPin('user-1', '2468')).toBe(false)
  })
})

describe('profiles', () => {
  it('creates, edits, protects with a PIN, lists in order and queues each change for sync', async () => {
    const maya = await accounts.createProfile('user-1', { name: 'Maya', avatar: 'fox', color: 'cranberry' })
    // Profiles are listed by creation time; make sure the two don't share a millisecond on a busy machine.
    await new Promise((r) => setTimeout(r, 3))
    const leo = await accounts.createProfile('user-1', { name: 'Leo', avatar: 'bear', color: 'sky', pin: '0000' })
    expect((await accounts.listProfiles('user-1')).map((p) => p.name)).toEqual(['Maya', 'Leo'])
    expect(await accounts.verifyProfilePin(maya.id, '')).toBe(true)
    expect(await accounts.verifyProfilePin(leo.id, '0000')).toBe(true)
    expect(await accounts.verifyProfilePin(leo.id, '9999')).toBe(false)

    await accounts.updateProfile(leo.id, { name: 'Leo B', avatar: 'owl', color: 'sky', pin: null })
    expect(await db.profiles.get(leo.id)).toMatchObject({ name: 'Leo B', avatar: 'owl', pinHash: null })
    expect((await db.outbox.toArray()).map((e) => e.key).sort()).toEqual([`profile:${leo.id}`, `profile:${maya.id}`].sort())
  })

  it('caps a family at six profiles', async () => {
    for (let i = 0; i < accounts.MAX_PROFILES; i++)
      await accounts.createProfile('user-1', { name: `Kid ${i}`, avatar: 'fox', color: 'sky' })
    await expect(accounts.createProfile('user-1', { name: 'One more', avatar: 'fox', color: 'sky' })).rejects.toThrow(/up to 6/)
  })

  it('deletes a profile with its artwork and activity, and queues the deletions', async () => {
    const p = await accounts.createProfile('user-1', { name: 'Maya', avatar: 'fox', color: 'cranberry' })
    const artId = `${p.id}:cozy-christmas:01`
    await db.artworks.add({ id: artId, profileId: p.id, bookId: 'cozy-christmas', pageId: '01', colorLayer: null, thumb: null, progress: 0.2, completedAt: null, updatedAt: Date.now() })
    await db.events.add({ uid: 'e1', accountId: 'user-1', profileId: p.id, type: 'coloring', at: Date.now() })
    await accounts.deleteProfile(p.id)
    expect(await db.profiles.count()).toBe(0)
    expect(await db.artworks.count()).toBe(0)
    expect(await db.events.count()).toBe(0)
    expect(await db.outbox.get(`artwork:${artId}`)).toBeTruthy()
  })
})

describe('session store PIN cool-down', () => {
  it('locks after five wrong tries', async () => {
    useSession.setState({ pinLocks: {} })
    const check = useSession.getState().checkPin
    for (let i = 0; i < 4; i++) expect(await check('t', async () => false)).toBe('wrong')
    expect(await check('t', async () => false)).toBe('locked')
    expect(await check('t', async () => true)).toBe('locked')
  })
})
