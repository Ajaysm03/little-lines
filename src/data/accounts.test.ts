import { describe, expect, it } from 'vitest'
import { useSession } from '../state/session-store'
import * as accounts from './accounts'
import { db } from './db'

const parent = { name: 'Ajay', email: 'Parent@Example.com ', password: 'cocoa-and-snow', parentPin: '2468' }

describe('accounts', () => {
  it('signs up, stores no plain secrets, and makes the first account admin', async () => {
    const a = await accounts.signUp(parent)
    expect(a.email).toBe('parent@example.com')
    expect(a.role).toBe('admin')
    expect(a).not.toHaveProperty('passwordHash')

    const row = await db.accounts.get(a.id)
    expect(row?.passwordHash).not.toContain('cocoa')
    expect(row?.parentPinHash).not.toContain('2468')

    const b = await accounts.signUp({ ...parent, email: 'second@example.com' })
    expect(b.role).toBe('parent')
  })

  it('rejects a duplicate email regardless of case', async () => {
    await accounts.signUp(parent)
    await expect(accounts.signUp({ ...parent, email: 'PARENT@example.com' })).rejects.toThrow(/already exists/)
  })

  it('validates input with field-specific messages', async () => {
    await expect(accounts.signUp({ ...parent, email: 'nope' })).rejects.toMatchObject({ field: 'email' })
    await expect(accounts.signUp({ ...parent, password: 'short' })).rejects.toMatchObject({ field: 'password' })
    await expect(accounts.signUp({ ...parent, parentPin: '12a4' })).rejects.toMatchObject({ field: 'parentPin' })
  })

  it('logs in with the right password only', async () => {
    await accounts.signUp(parent)
    const a = await accounts.logIn('parent@example.com', 'cocoa-and-snow')
    expect(a.name).toBe('Ajay')
    await expect(accounts.logIn('parent@example.com', 'wrong-password')).rejects.toThrow(/don’t match/)
    await expect(accounts.logIn('nobody@example.com', 'cocoa-and-snow')).rejects.toThrow(/don’t match/)
  })

  it('checks and changes the parent PIN', async () => {
    const a = await accounts.signUp(parent)
    expect(await accounts.verifyParentPin(a.id, '2468')).toBe(true)
    expect(await accounts.verifyParentPin(a.id, '1111')).toBe(false)
    await accounts.changeParentPin(a.id, '2468', '1357')
    expect(await accounts.verifyParentPin(a.id, '1357')).toBe(true)
  })
})

describe('profiles', () => {
  it('creates, edits, protects with a PIN and lists in order', async () => {
    const a = await accounts.signUp(parent)
    const maya = await accounts.createProfile(a.id, { name: 'Maya', avatar: 'fox', color: 'cranberry' })
    const leo = await accounts.createProfile(a.id, { name: 'Leo', avatar: 'bear', color: 'sky', pin: '0000' })
    expect((await accounts.listProfiles(a.id)).map((p) => p.name)).toEqual(['Maya', 'Leo'])

    expect(await accounts.verifyProfilePin(maya.id, '')).toBe(true)
    expect(await accounts.verifyProfilePin(leo.id, '0000')).toBe(true)
    expect(await accounts.verifyProfilePin(leo.id, '9999')).toBe(false)

    await accounts.updateProfile(leo.id, { name: 'Leo B', avatar: 'owl', color: 'sky', pin: null })
    const updated = await db.profiles.get(leo.id)
    expect(updated).toMatchObject({ name: 'Leo B', avatar: 'owl', pinHash: null })
  })

  it('caps a family at six profiles', async () => {
    const a = await accounts.signUp(parent)
    for (let i = 0; i < accounts.MAX_PROFILES; i++)
      await accounts.createProfile(a.id, { name: `Kid ${i}`, avatar: 'fox', color: 'sky' })
    await expect(accounts.createProfile(a.id, { name: 'One more', avatar: 'fox', color: 'sky' })).rejects.toThrow(
      /up to 6/,
    )
  })

  it('deletes a profile with its artwork and activity', async () => {
    const a = await accounts.signUp(parent)
    const p = await accounts.createProfile(a.id, { name: 'Maya', avatar: 'fox', color: 'cranberry' })
    await db.artworks.add({
      id: `${p.id}:cozy-christmas:01`,
      profileId: p.id,
      bookId: 'cozy-christmas',
      pageId: '01',
      colorLayer: null,
      thumb: null,
      progress: 0.2,
      completedAt: null,
      updatedAt: Date.now(),
    })
    await db.events.add({ accountId: a.id, profileId: p.id, type: 'stroke', at: Date.now() })
    await accounts.deleteProfile(p.id)
    expect(await db.profiles.count()).toBe(0)
    expect(await db.artworks.count()).toBe(0)
    expect(await db.events.count()).toBe(0)
  })
})

describe('session store PIN cool-down', () => {
  it('locks after five wrong tries', async () => {
    useSession.setState({ pinLocks: {} })
    const check = useSession.getState().checkPin
    for (let i = 0; i < 4; i++) expect(await check('t', async () => false)).toBe('wrong')
    expect(await check('t', async () => false)).toBe('locked')
    // Even the right PIN waits out the cool-down.
    expect(await check('t', async () => true)).toBe('locked')
  })
})
