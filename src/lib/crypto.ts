import { pbkdf2Async } from '@noble/hashes/pbkdf2.js'
import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Salted PBKDF2-SHA256 hashes for passwords and PINs.
 *
 * Stored format: pbkdf2-sha256$<iterations>$<salt b64>$<hash b64>
 *
 * Uses WebCrypto when the page is a secure context (localhost / https) and falls
 * back to a pure-JS PBKDF2 otherwise, e.g. an iPad opening the dev server over the
 * LAN. Both produce identical output, so a hash made one way verifies the other.
 */
export const PASSWORD_ITERATIONS = 210_000
export const PIN_ITERATIONS = 60_000
const KEY_BYTES = 32

const enc = new TextEncoder()

function toB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function fromB64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

async function derive(secret: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle
  if (subtle && globalThis.isSecureContext !== false) {
    const key = await subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits'])
    const bits = await subtle.deriveBits(
      { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
      key,
      KEY_BYTES * 8,
    )
    return new Uint8Array(bits)
  }
  return pbkdf2Async(sha256, enc.encode(secret), salt, { c: iterations, dkLen: KEY_BYTES })
}

export async function hashSecret(secret: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(secret, salt, iterations)
  return `pbkdf2-sha256$${iterations}$${toB64(salt)}$${toB64(hash)}`
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const [algo, iter, saltB64, hashB64] = stored.split('$')
  if (algo !== 'pbkdf2-sha256' || !iter || !saltB64 || !hashB64) return false
  const expected = fromB64(hashB64)
  const actual = await derive(secret, fromB64(saltB64), Number(iter))
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}
