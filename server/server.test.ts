// @vitest-environment node
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

/**
 * The real API (Better Auth + sync) against an in-memory Postgres (PGlite), over
 * HTTP, the way the browser uses it.
 */
let pglite: PGlite
let socket: PGLiteSocketServer
let http: Server
let base = ''
let app: typeof import('./app.js')
let email: typeof import('./email.js')

beforeAll(async () => {
  pglite = await PGlite.create()
  const port = 15000 + Math.floor(Math.random() * 5000)
  socket = new PGLiteSocketServer({ db: pglite, port, host: '127.0.0.1' })
  await socket.start()
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`
  process.env.BETTER_AUTH_SECRET = 'test-secret-test-secret-test-secret-1234'
  process.env.RESEND_API_KEY = ''
  const { resetPool } = await import('./db.js')
  const { resetAuth } = await import('./auth.js')
  await resetPool()
  resetAuth()
  const { migrate } = await import('./migrate.js')
  await migrate()
  app = await import('./app.js')
  email = await import('./email.js')
  http = createServer((req, res) => void app.handle(req, res))
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  process.env.APP_URL = base
  resetAuth()
}, 60_000)

afterAll(async () => {
  http?.close()
  const { resetPool } = await import('./db.js')
  await resetPool()
  await socket?.stop()
  await pglite?.close()
})

/** A tiny cookie-keeping client, like one browser. */
function browser() {
  let cookie = ''
  return async (path: string, init: RequestInit & { json?: unknown } = {}) => {
    const headers = new Headers(init.headers)
    headers.set('origin', base)
    if (cookie) headers.set('cookie', cookie)
    if (init.json !== undefined) headers.set('content-type', 'application/json')
    const res = await fetch(base + path, { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body, redirect: 'manual' })
    const set = res.headers.getSetCookie()
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ')
    return res
  }
}

describe('server', () => {
  it('reports which sign-in options are on', async () => {
    const res = await fetch(`${base}/api/config`)
    expect(await res.json()).toEqual({ google: false })
  })

  it('signs up grown-ups (never as owner) and keeps the API behind sign-in', async () => {
    expect((await fetch(`${base}/api/me`)).status).toBe(401)
    const a = browser()
    const up = await a('/api/auth/sign-up/email', { method: 'POST', json: { name: 'Ana', email: 'ana@example.test', password: 'crayons-123' } })
    expect(up.status).toBe(200)
    const me = await (await a('/api/me')).json()
    expect(me).toMatchObject({ email: 'ana@example.test', role: 'parent', username: null, parentPinHash: null, signInMethods: ['password'] })

    const b = browser()
    await b('/api/auth/sign-up/email', { method: 'POST', json: { name: 'Ben', email: 'ben@example.test', password: 'crayons-456' } })
    expect((await (await b('/api/me')).json()).role).toBe('parent')
  })

  it('rejects a wrong password and a duplicate email', async () => {
    const c = browser()
    expect((await c('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'nope-nope' } })).status).toBe(401)
    const dup = await c('/api/auth/sign-up/email', { method: 'POST', json: { name: 'X', email: 'ana@example.test', password: 'crayons-999' } })
    expect(dup.status).toBe(422)
  })

  it('resets a forgotten password with the emailed link', async () => {
    const a = browser()
    const ask = await a('/api/auth/request-password-reset', { method: 'POST', json: { email: 'ana@example.test', redirectTo: `${base}/reset-password` } })
    expect(ask.status).toBe(200)
    const sent = email.outbox.at(-1)!
    expect(sent.to).toBe('ana@example.test')
    // The emailed link checks the token, then sends the browser to the app's reset page with it.
    const hop = await a(new URL(sent.url).pathname + new URL(sent.url).search)
    const landing = new URL(hop.headers.get('location')!, base)
    expect(landing.pathname).toBe('/reset-password')
    const token = landing.searchParams.get('token')!
    expect(token).toBeTruthy()
    expect((await a('/api/auth/reset-password', { method: 'POST', json: { newPassword: 'new-crayons-1', token } })).status).toBe(200)
    // Old password out, new one in; the token can't be reused.
    expect((await a('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'crayons-123' } })).status).toBe(401)
    expect((await a('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'new-crayons-1' } })).status).toBe(200)
    expect((await a('/api/auth/reset-password', { method: 'POST', json: { newPassword: 'again-again-1', token } })).status).toBe(400)
  })

  it('does not reveal whether an email has an account', async () => {
    const res = await fetch(`${base}/api/auth/request-password-reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: base },
      body: JSON.stringify({ email: 'nobody@example.test', redirectTo: `${base}/reset-password` }),
    })
    expect(res.status).toBe(200)
  })

  it('syncs profiles, artwork, events and images between devices of one family only', async () => {
    const phone = browser()
    await phone('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'new-crayons-1' } })
    const pin = await phone('/api/me/pin', { method: 'PUT', json: { parentPinHash: 'pbkdf2-sha256$1$abc$def' } })
    expect((await pin.json()).parentPinHash).toBe('pbkdf2-sha256$1$abc$def')

    const t = Date.now()
    await phone('/api/sync', {
      method: 'POST',
      json: {
        profiles: [{ id: 'p-maya', name: 'Maya', avatar: 'fox', color: 'sky', pinHash: null, createdAt: t, lastActiveAt: null, updatedAt: t }],
        artworks: [{ id: 'p-maya:cozy:01', profileId: 'p-maya', bookId: 'cozy', pageId: '01', progress: 0.5, completedAt: null, finishedByChild: false, hasLayer: true, updatedAt: t }],
        events: [{ uid: 'ev-1', profileId: 'p-maya', type: 'coloring', at: t, data: { ms: 60000, strokes: 3 } }],
      },
    })
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    expect((await phone('/api/blob?key=art:p-maya:cozy:01:layer', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).status).toBe(200)

    // The family's tablet sees everything.
    const tablet = browser()
    await tablet('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'new-crayons-1' } })
    const pulled = await (await tablet('/api/sync?since=0')).json()
    expect(pulled.profiles.map((p: { name: string }) => p.name)).toEqual(['Maya'])
    expect(pulled.artworks[0]).toMatchObject({ progress: 0.5, hasLayer: true })
    expect(pulled.events[0]).toMatchObject({ uid: 'ev-1', data: { ms: 60000, strokes: 3 } })
    const img = new Uint8Array(await (await tablet('/api/blob?key=art:p-maya:cozy:01:layer')).arrayBuffer())
    expect([...img]).toEqual([...png])

    // An older edit doesn't overwrite a newer one; a tombstone deletes.
    await tablet('/api/sync', { method: 'POST', json: { profiles: [{ id: 'p-maya', name: 'Old name', avatar: 'fox', color: 'sky', pinHash: null, createdAt: t, lastActiveAt: null, updatedAt: t - 1000 }] } })
    expect((await (await phone('/api/sync?since=0')).json()).profiles[0].name).toBe('Maya')

    // Another family can't see or overwrite any of it.
    const other = browser()
    await other('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ben@example.test', password: 'crayons-456' } })
    const theirs = await (await other('/api/sync?since=0')).json()
    expect(theirs.profiles).toEqual([])
    expect((await other('/api/blob?key=art:p-maya:cozy:01:layer')).status).toBe(404)
    expect((await other('/api/blob?key=art:p-maya:cozy:01:layer', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).status).toBe(403)
    await other('/api/sync', { method: 'POST', json: { profiles: [{ id: 'p-maya', name: 'Hacked', avatar: 'fox', color: 'sky', pinHash: null, createdAt: t, lastActiveAt: null, updatedAt: t + 99999 }] } })
    expect((await (await phone('/api/sync?since=0')).json()).profiles[0].name).toBe('Maya')
  }, 30_000)

  it('makes the owner from the terminal, signs them in by username, and keeps the console theirs', async () => {
    const { createOrUpdateOwner } = await import('./owner.js')
    await expect(createOrUpdateOwner({ username: 'Boss', email: 'boss@example.test', name: 'Boss', password: 'short' })).rejects.toThrow(/Username|12 characters/)
    const { created } = await createOrUpdateOwner({ username: 'boss', email: 'boss@example.test', name: 'The Owner', password: 'owner-password-1' })
    expect(created).toBe(true)

    const owner = browser()
    expect((await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'wrong-password-1' } })).status).toBe(401)
    expect((await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-1' } })).status).toBe(200)
    expect(await (await owner('/api/me')).json()).toMatchObject({ role: 'owner', username: 'boss', email: 'boss@example.test' })

    // The overview lists families, not the owner.
    const o = await (await owner('/api/admin/overview')).json()
    expect(o.families.map((f: { email: string }) => f.email).sort()).toEqual(['ana@example.test', 'ben@example.test'])
    expect(o.profiles).toHaveLength(1)

    // Creation and the sign-in are in the audit log, newest first; filters work.
    const log = await (await owner('/api/admin/audit')).json()
    expect(log.entries.map((e: { action: string }) => e.action).slice(0, 2)).toEqual(['owner.signed_in', 'owner.created'])
    expect(log.entries[0].context.ip ?? log.entries[0].context.browser).toBeTruthy()
    const signins = await (await owner('/api/admin/audit?action=owner.signed_in')).json()
    expect(signins.entries.map((e: { action: string }) => e.action)).toEqual(['owner.signed_in'])
    const account = await (await owner('/api/admin/audit?action=owner.created,role.')).json()
    expect(account.entries.map((e: { action: string }) => e.action)).toEqual(['owner.created'])

    // Grown-ups can't open the console.
    const parent = browser()
    await parent('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ben@example.test', password: 'crayons-456' } })
    expect((await parent('/api/admin/overview')).status).toBe(403)
    expect((await parent('/api/admin/audit')).status).toBe(403)

    // Running owner:create again changes the password and signs the owner out everywhere.
    expect((await createOrUpdateOwner({ username: 'boss', email: 'boss@example.test', name: 'The Owner', password: 'owner-password-2' })).created).toBe(false)
    expect((await owner('/api/me')).status).toBe(401)
    const again = browser()
    expect((await again('/api/auth/sign-in/email', { method: 'POST', json: { email: 'boss@example.test', password: 'owner-password-2' } })).status).toBe(200)

    // There is one owner: making Ben the owner turns Boss back into a grown-up.
    await createOrUpdateOwner({ username: 'ben', email: 'ben@example.test', name: 'Ben', password: 'ben-owner-pass-1' })
    expect((await (await again('/api/me')).json()).role).toBe('parent')
    // Making Boss the owner again (which also signs Boss out) turns Ben back into a grown-up.
    await createOrUpdateOwner({ username: 'boss', email: 'boss@example.test', name: 'The Owner', password: 'owner-password-2' })
    expect((await again('/api/me')).status).toBe(401)
    const { query } = await import('./db.js')
    const roles = await query<{ email: string; role: string }>(`select u.email, f.role from app_family f join "user" u on u.id = f.user_id where f.role = 'owner'`)
    expect(roles.rows).toEqual([{ email: 'boss@example.test', role: 'owner' }])
  })

  it('retires the old admin role when migrating', async () => {
    const { query } = await import('./db.js')
    const { migrate } = await import('./migrate.js')
    await query(`update app_family set role = 'admin' where user_id = (select id from "user" where email = 'ana@example.test')`)
    await migrate()
    const { rows } = await query<{ role: string }>(`select role from app_family f join "user" u on u.id = f.user_id where u.email = 'ana@example.test'`)
    expect(rows[0].role).toBe('parent')
    const { rows: log } = await query<{ action: string }>(`select action from app_audit order by id desc limit 1`)
    expect(log[0].action).toBe('role.changed')
  })

  it('lets grown-ups keep their imported books but not add new ones', async () => {
    const { query } = await import('./db.js')
    const ana = browser()
    await ana('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'new-crayons-1' } })
    const anaId = (await (await ana('/api/me')).json()).id
    await query(`insert into app_book (id, user_id, meta, updated_at, deleted, server_at) values ('imported-old', $1, '{"title":"Old"}', 1, false, 1)`, [anaId])

    const push = await ana('/api/sync', {
      method: 'POST',
      json: { books: [{ id: 'imported-new', meta: { title: 'New' }, updatedAt: 5, deleted: false }, { id: 'imported-old', meta: { title: 'Old, renamed' }, updatedAt: 5, deleted: false }] },
    })
    expect(push.status).toBe(200)
    const { rows } = await query<{ id: string; meta: { title: string } }>('select id, meta from app_book where user_id = $1 order by id', [anaId])
    expect(rows.map((r) => [r.id, r.meta.title])).toEqual([['imported-old', 'Old, renamed']])

    // Images for a book the server doesn't have are accepted but not stored, so the device's outbox moves on.
    const png = new Uint8Array([137, 80, 78, 71])
    const put = await ana('/api/blob?key=book:imported-new/p01', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })
    expect(await put.json()).toEqual({ ok: true, ignored: true })
    expect((await ana('/api/blob?key=book:imported-new/p01')).status).toBe(404)
    expect((await (await ana('/api/blob?key=book:imported-old/p01', { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).json()).ok).toBe(true)
  })

  it('sends Google sign-in to Google with the right return address once keys are set', async () => {
    const { resetAuth } = await import('./auth.js')
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
    resetAuth()
    try {
      expect(await (await fetch(`${base}/api/config`)).json()).toEqual({ google: true })
      const res = await browser()('/api/auth/sign-in/social', { method: 'POST', json: { provider: 'google', callbackURL: `${base}/` } })
      const { url } = (await res.json()) as { url: string }
      const google = new URL(url)
      expect(google.hostname).toBe('accounts.google.com')
      expect(google.searchParams.get('client_id')).toBe('test-client-id.apps.googleusercontent.com')
      expect(google.searchParams.get('redirect_uri')).toBe(`${base}/api/auth/callback/google`)
      expect(google.searchParams.get('scope')).toContain('email')
    } finally {
      process.env.GOOGLE_CLIENT_ID = ''
      process.env.GOOGLE_CLIENT_SECRET = ''
      resetAuth()
    }
  })

  it('routes Vercel-style rewritten paths', async () => {
    expect(await (await fetch(`${base}/api?__path=config`)).json()).toEqual({ google: false })
  })
})
