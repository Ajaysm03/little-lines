import { pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it } from 'vitest'
import { hashSecret, verifySecret } from './crypto'
import { newId } from './id'

describe('hashSecret / verifySecret', () => {
  it('verifies the right secret and rejects a wrong one', async () => {
    const stored = await hashSecret('snowflake-42', 1000)
    expect(stored).toMatch(/^pbkdf2-sha256\$1000\$/)
    expect(await verifySecret('snowflake-42', stored)).toBe(true)
    expect(await verifySecret('snowflake-43', stored)).toBe(false)
  })

  it('salts every hash', async () => {
    expect(await hashSecret('1234', 1000)).not.toBe(await hashSecret('1234', 1000))
  })

  it('rejects malformed stored values', async () => {
    expect(await verifySecret('x', 'not-a-hash')).toBe(false)
  })

  it('matches the pure-JS fallback used on non-secure pages', async () => {
    const stored = await hashSecret('gingerbread', 2000)
    const [, iter, saltB64, hashB64] = stored.split('$')
    const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
    const js = await pbkdf2Async(sha256, new TextEncoder().encode('gingerbread'), salt, { c: Number(iter), dkLen: 32 })
    expect(btoa(String.fromCharCode(...js))).toBe(hashB64)
  })
})

describe('newId', () => {
  it('makes v4-shaped unique ids', () => {
    const a = newId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newId()).not.toBe(a)
  })
})
