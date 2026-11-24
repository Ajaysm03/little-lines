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

  it('lets the owner upload, edit and publish books, and shows families only published ones', async () => {
    const owner = browser()
    await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-2' } })
    const family = browser()
    // Ben's password was changed when the owner test briefly made him the owner.
    expect((await family('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ben@example.test', password: 'ben-owner-pass-1' } })).status).toBe(200)
    expect((await family('/api/admin/books')).status).toBe(403)

    const meta = { title: 'Ocean Friends', subtitle: 'Under the sea', description: 'Fish and whales.', category: 'Animals', ageRange: '4–8', tags: ['Sea'], theme: { accent: '#3d8be8', deep: '#1b1e45', glow: '#f2c230', palette: ['#3d8be8'] }, pageSize: { width: 1600, height: 2263 } }
    const pages = [
      { id: 'front-cover', kind: 'front-cover', title: 'Front cover' },
      { id: 'p01', kind: 'line-art', title: 'Whale' },
      { id: 'p02', kind: 'line-art', title: 'Octopus' },
    ]
    expect((await owner('/api/admin/books', { method: 'POST', json: { meta: { ...meta, title: '' }, pages } })).status).toBe(400)
    const created = await (await owner('/api/admin/books', { method: 'POST', json: { meta, pages } })).json()
    expect(created).toMatchObject({ status: 'draft', tier: 'free', origin: 'upload', pages })
    const id: string = created.id

    // Drafts are invisible to families, and can't be published until every image is uploaded.
    expect((await (await family('/api/catalog')).json()).books).toEqual([])
    const missing = await owner(`/api/admin/books/${id}/status`, { method: 'PUT', json: { status: 'published' } })
    expect(missing.status).toBe(400)
    expect((await missing.json()).error).toMatch(/missing/)
    const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    for (const key of ['front-cover', 'front-cover-thumb', 'p01', 'p01-thumb', 'p02', 'p02-thumb'])
      expect((await owner(`/api/admin/books/${id}/image?key=${key}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).status).toBe(200)
    expect((await owner(`/api/admin/books/${id}/image?key=p09`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })).status).toBe(404)
    expect((await family(`/api/catalog/image?key=${id}/p01`)).status).toBe(404)
    expect((await owner(`/api/catalog/image?key=${id}/p01`)).status).toBe(200)

    const published = await (await owner(`/api/admin/books/${id}/status`, { method: 'PUT', json: { status: 'published' } })).json()
    expect(published.status).toBe('published')
    expect(published.publishedAt).toBeGreaterThan(0)
    const cat = await (await family('/api/catalog')).json()
    expect(cat.books.map((b: { id: string }) => b.id)).toEqual([id])
    expect(cat.books[0].sourceUserId).toBeUndefined()
    const img = await family(`/api/catalog/image?key=${id}/p01&v=${cat.books[0].version}`)
    expect(img.status).toBe(200)
    expect(img.headers.get('cache-control')).toContain('immutable')
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(png)

    // Edit: rename, reorder and remove a page. The removed page's images go too.
    const edited = await (
      await owner(`/api/admin/books/${id}`, {
        method: 'PUT',
        json: { meta: { ...meta, title: 'Ocean Pals' }, pages: [pages[0], { ...pages[2], title: 'Big octopus' }] },
      })
    ).json()
    expect(edited.pages.map((p: { title: string }) => p.title)).toEqual(['Front cover', 'Big octopus'])
    expect(edited.version).toBeGreaterThan(published.version)
    expect(edited.images).not.toContain(`${id}/p01`)
    // New coloring pages can't be invented in the editor.
    expect((await owner(`/api/admin/books/${id}`, { method: 'PUT', json: { pages: [...edited.pages, { id: 'p07', kind: 'line-art', title: 'New' }] } })).status).toBe(400)

    // Premium, then order with the bundled book, then hide the bundled book.
    expect((await (await owner(`/api/admin/books/${id}/tier`, { method: 'PUT', json: { tier: 'premium' } })).json()).tier).toBe('premium')
    expect((await owner('/api/admin/books/order', { method: 'PUT', json: { ids: [id, 'cozy-christmas'], bundled: { 'cozy-christmas': 'Cozy Christmas' } } })).status).toBe(200)
    await owner('/api/admin/books/cozy-christmas/status', { method: 'PUT', json: { status: 'draft', bundledTitle: 'Cozy Christmas' } })
    const after = await (await family('/api/catalog')).json()
    expect(after.books[0]).toMatchObject({ id, tier: 'premium', sortOrder: 1 })
    expect(after.bundled).toEqual([expect.objectContaining({ id: 'cozy-christmas', status: 'draft', sortOrder: 2 })])
    await owner('/api/admin/books/cozy-christmas/status', { method: 'PUT', json: { status: 'published', bundledTitle: 'Cozy Christmas' } })
    expect((await owner('/api/admin/books/cozy-christmas/status', { method: 'PUT', json: { status: 'archived', bundledTitle: 'Cozy Christmas' } })).status).toBe(400)

    // Deleting: never while published, and only with the exact title typed.
    expect((await owner(`/api/admin/books/${id}`, { method: 'DELETE', json: { confirmTitle: 'Ocean Pals' } })).status).toBe(400)
    await owner(`/api/admin/books/${id}/status`, { method: 'PUT', json: { status: 'archived' } })
    expect((await owner(`/api/admin/books/${id}`, { method: 'DELETE', json: { confirmTitle: 'Ocean' } })).status).toBe(400)
    expect((await owner(`/api/admin/books/${id}`, { method: 'DELETE', json: { confirmTitle: 'Ocean Pals' } })).status).toBe(200)
    expect((await owner(`/api/admin/books/${id}`)).status).toBe(404)
    expect((await owner(`/api/catalog/image?key=${id}/p02`)).status).toBe(404)

    const log = await (await owner('/api/admin/audit?action=book.')).json()
    expect(log.entries.map((e: { action: string }) => e.action)).toEqual([
      'book.deleted', 'book.archived', 'book.published', 'book.unpublished', 'book.reordered', 'book.tier_changed', 'book.updated', 'book.published', 'book.created',
    ])
  })

  it('moves books families imported into the catalog as drafts, keeping their id and images', async () => {
    const { query } = await import('./db.js')
    const { migrate } = await import('./migrate.js')
    const ana = browser()
    await ana('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'new-crayons-1' } })
    const anaId = (await (await ana('/api/me')).json()).id
    const meta = {
      id: 'imported-fam1', title: 'Our Farm', subtitle: '', description: '', ageRange: '', tags: [], theme: { accent: '#e0475b', deep: '#1b1e45', glow: '#f2c230', palette: [] },
      pageSize: { width: 1600, height: 2263 }, pages: [{ id: 'p01', kind: 'line-art', title: 'Cow', image: 'imported-fam1/p01', thumb: 'imported-fam1/p01-thumb' }],
    }
    await query(`insert into app_book (id, user_id, meta, updated_at, deleted, server_at) values ('imported-fam1', $1, $2, 1, false, 1)`, [anaId, JSON.stringify(meta)])
    const png = new Uint8Array([137, 80, 78, 71, 9])
    for (const k of ['p01', 'p01-thumb']) await ana(`/api/blob?key=book:imported-fam1/${k}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })

    const before = Date.now() - 5000
    await migrate()
    await migrate() // running it again changes nothing

    const owner = browser()
    await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-2' } })
    const book = await (await owner('/api/admin/books/imported-fam1')).json()
    expect(book).toMatchObject({ origin: 'family-import', status: 'draft', meta: { title: 'Our Farm', category: 'Other' }, pages: [{ id: 'p01', kind: 'line-art', title: 'Cow' }] })
    expect(book.images.sort()).toEqual(['imported-fam1/p01', 'imported-fam1/p01-thumb'])
    // The family's own copy is gone (devices drop it on their next pull); its images moved.
    const pull = await (await ana(`/api/sync?since=${before}`)).json()
    expect(pull.books.filter((b: { id: string }) => b.id === 'imported-fam1')).toEqual([expect.objectContaining({ deleted: true })])
    expect((await ana('/api/blob?key=book:imported-fam1/p01')).status).toBe(404)
    const moved = await query(`select count(*)::int as n from app_audit where action = 'book.moved_from_family' and target_id = 'imported-fam1'`)
    expect(moved.rows[0].n).toBe(1)
  })

  it('starts new families on a trial, lets the owner change plans, and locks Premium pages on Free', async () => {
    const { query } = await import('./db.js')
    const { migrate } = await import('./migrate.js')
    const DAY = 86_400_000
    const owner = browser()
    await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-2' } })

    // A new family gets a 14-day trial by default.
    const cleo = browser()
    await cleo('/api/auth/sign-up/email', { method: 'POST', json: { name: 'Cleo', email: 'cleo@example.test', password: 'crayons-777' } })
    const me = await (await cleo('/api/me')).json()
    expect(me.plan).toMatchObject({ plan: 'trial', effective: 'trial' })
    expect(Math.round((me.plan.endsAt - me.plan.startedAt) / DAY)).toBe(14)

    // Trials off: the next family starts on Free. Then back to 7 days.
    expect((await owner('/api/admin/settings/trial-days', { method: 'PUT', json: { trialDays: -1 } })).status).toBe(400)
    expect(await (await owner('/api/admin/settings/trial-days', { method: 'PUT', json: { trialDays: 0 } })).json()).toEqual({ trialDays: 0 })
    const dan = browser()
    await dan('/api/auth/sign-up/email', { method: 'POST', json: { name: 'Dan', email: 'dan@example.test', password: 'crayons-888' } })
    const danMe = await (await dan('/api/me')).json()
    expect(danMe.plan).toMatchObject({ plan: 'free', effective: 'free', endsAt: null })
    await owner('/api/admin/settings/trial-days', { method: 'PUT', json: { trialDays: 7 } })
    expect((await (await owner('/api/admin/plans')).json()).trialDays).toBe(7)

    // A published Premium book: Dan (Free) sees the cover but not the pages.
    const meta = { title: 'Space Trip', category: 'Other', pageSize: { width: 1600, height: 2263 } }
    const pages = [{ id: 'front-cover', kind: 'front-cover', title: 'Front cover' }, { id: 'p01', kind: 'line-art', title: 'Rocket' }]
    const id = (await (await owner('/api/admin/books', { method: 'POST', json: { meta, pages } })).json()).id
    const png = new Uint8Array([137, 80, 78, 71, 7])
    for (const key of ['front-cover', 'front-cover-thumb', 'p01', 'p01-thumb'])
      await owner(`/api/admin/books/${id}/image?key=${key}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: png })
    await owner(`/api/admin/books/${id}/tier`, { method: 'PUT', json: { tier: 'premium' } })
    await owner(`/api/admin/books/${id}/status`, { method: 'PUT', json: { status: 'published' } })
    expect((await dan(`/api/catalog/image?key=${id}/front-cover-thumb`)).status).toBe(200)
    expect((await dan(`/api/catalog/image?key=${id}/p01`)).status).toBe(403)
    expect((await cleo(`/api/catalog/image?key=${id}/p01`)).status).toBe(200) // on a trial

    // The owner gifts Dan Premium; a trial needs an end date; dates must be in the future.
    const danId = danMe.id
    expect((await owner(`/api/admin/families/${danId}/plan`, { method: 'PUT', json: { plan: 'trial', endsAt: null } })).status).toBe(400)
    expect((await owner(`/api/admin/families/${danId}/plan`, { method: 'PUT', json: { plan: 'premium', endsAt: Date.now() - DAY } })).status).toBe(400)
    expect((await owner(`/api/admin/families/${me.id}/plan`, { method: 'PUT', json: { plan: 'premium' } })).status).toBe(200)
    const gifted = await (await owner(`/api/admin/families/${danId}/plan`, { method: 'PUT', json: { plan: 'premium', endsAt: null, note: 'Helped test' } })).json()
    expect(gifted).toMatchObject({ plan: 'premium', effective: 'premium', endsAt: null, note: 'Helped test' })
    expect((await dan(`/api/catalog/image?key=${id}/p01`)).status).toBe(200)
    expect((await owner('/api/admin/families/nobody/plan', { method: 'PUT', json: { plan: 'free' } })).status).toBe(404)

    // An ended plan counts as Free without anything having to run.
    await query('update app_family set plan_ends_at = $2 where user_id = $1', [danId, Date.now() - 1000])
    expect((await (await dan('/api/me')).json()).plan).toMatchObject({ plan: 'premium', effective: 'free' })
    expect((await dan(`/api/catalog/image?key=${id}/p01`)).status).toBe(403)
    const rows = (await (await owner('/api/admin/plans')).json()).families
    expect(rows.find((f: { email: string }) => f.email === 'dan@example.test')).toMatchObject({ plan: 'premium', effective: 'free' })
    expect(rows.some((f: { email: string }) => f.email === 'boss@example.test')).toBe(false)

    // Families from before plans existed get a trial when migrating; nobody else changes.
    await query(`update app_family set plan = null where user_id = $1`, [danId])
    await migrate()
    expect((await (await dan('/api/me')).json()).plan).toMatchObject({ plan: 'trial', effective: 'trial' })
    expect((await (await cleo('/api/me')).json()).plan.plan).toBe('premium')

    const log = await (await owner('/api/admin/audit?action=plan.,settings.')).json()
    expect(log.entries.map((e: { action: string }) => e.action)).toEqual(['plan.started', 'plan.changed', 'plan.changed', 'settings.trial_days', 'settings.trial_days'])
    expect(log.entries[1].summary).toContain('Dan')
  })

  it('lists users with their status, and lets the owner suspend, reactivate, reset and delete accounts', async () => {
    const { query } = await import('./db.js')
    const { userStatus } = await import('./users.js')
    const DAY = 86_400_000
    const now = Date.now()
    expect(userStatus({ suspendedAt: 1, lastLoginAt: now, lastColoringAt: now }, now)).toBe('suspended')
    expect(userStatus({ suspendedAt: null, lastLoginAt: now, lastColoringAt: null }, now)).toBe('never-started')
    expect(userStatus({ suspendedAt: null, lastLoginAt: now - 40 * DAY, lastColoringAt: now - 31 * DAY }, now)).toBe('inactive')
    expect(userStatus({ suspendedAt: null, lastLoginAt: now - 2 * DAY, lastColoringAt: now - 60 * DAY }, now)).toBe('active')

    const owner = browser()
    await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-2' } })
    const cleo = browser()
    await cleo('/api/auth/sign-in/email', { method: 'POST', json: { email: 'cleo@example.test', password: 'crayons-777' } })
    expect((await cleo('/api/admin/users')).status).toBe(403)
    const cleoId = (await (await cleo('/api/me')).json()).id
    await query(`insert into app_event (uid, user_id, profile_id, type, book_id, page_id, at, data, server_at) values ('ev-cleo-1', $1, null, 'coloring', 'cozy-christmas', 'p01', $2, '{"ms":60000}', $2)`, [cleoId, now - DAY])

    const list = (await (await owner('/api/admin/users')).json()).users as Array<{ id: string; email: string; status: string; lastLoginAt: number | null; coloringMs: number }>
    expect(list.some((u) => u.email === 'boss@example.test')).toBe(false)
    const c = list.find((u) => u.email === 'cleo@example.test')!
    expect(c).toMatchObject({ status: 'active', coloringMs: 60000 })
    expect(c.lastLoginAt).toBeGreaterThan(now - 60_000)
    expect(list.find((u) => u.email === 'dan@example.test')!.status).toBe('never-started')

    const detail = await (await owner(`/api/admin/users/${cleoId}`)).json()
    expect(detail).toMatchObject({ email: 'cleo@example.test', signInMethods: ['password'], books: [], activity: [expect.objectContaining({ type: 'coloring', ms: 60000 })] })

    // Suspend: signed out at once, and sign-in is refused with a clear message.
    const suspended = await (await owner(`/api/admin/users/${cleoId}/suspend`, { method: 'POST', json: { reason: 'Testing' } })).json()
    expect(suspended).toMatchObject({ status: 'suspended', suspendedReason: 'Testing' })
    expect((await cleo('/api/me')).status).toBe(401)
    const refused = await cleo('/api/auth/sign-in/email', { method: 'POST', json: { email: 'cleo@example.test', password: 'crayons-777' } })
    expect(refused.status).toBe(403)
    expect((await refused.json()).code).toBe('ACCOUNT_SUSPENDED')
    expect((await owner(`/api/admin/users/${cleoId}/password-reset`, { method: 'POST', json: {} })).status).toBe(400)
    expect((await owner(`/api/admin/users/${cleoId}/suspend`, { method: 'POST', json: {} })).status).toBe(400)

    // Reactivate, then the reset email goes out.
    expect((await (await owner(`/api/admin/users/${cleoId}/reactivate`, { method: 'POST', json: {} })).json()).status).toBe('active')
    expect((await cleo('/api/auth/sign-in/email', { method: 'POST', json: { email: 'cleo@example.test', password: 'crayons-777' } })).status).toBe(200)
    const sentBefore = email.outbox.length
    expect((await owner(`/api/admin/users/${cleoId}/password-reset`, { method: 'POST', json: {} })).status).toBe(200)
    expect(email.outbox.length).toBe(sentBefore + 1)
    expect(email.outbox.at(-1)!.to).toBe('cleo@example.test')

    // Delete: only with the email typed; everything of theirs goes; the owner can't be deleted here.
    await query(`insert into app_profile (id, user_id, name, avatar, color, created_at, updated_at, deleted, server_at) values ('prof-cleo', $1, 'Kit', 'bear', 'meadow', 1, 1, false, 1)`, [cleoId])
    expect((await owner(`/api/admin/users/${cleoId}`, { method: 'DELETE', json: { confirmEmail: 'cleo@example' } })).status).toBe(400)
    expect((await owner(`/api/admin/users/${cleoId}`, { method: 'DELETE', json: { confirmEmail: 'CLEO@example.test' } })).status).toBe(200)
    expect((await owner(`/api/admin/users/${cleoId}`)).status).toBe(404)
    expect((await cleo('/api/me')).status).toBe(401)
    for (const t of ['app_profile', 'app_event', 'app_family'])
      expect((await query(`select count(*)::int as n from ${t} where user_id = $1`, [cleoId])).rows[0].n).toBe(0)
    const bossId = (await (await owner('/api/me')).json()).id
    expect((await owner(`/api/admin/users/${bossId}/suspend`, { method: 'POST', json: {} })).status).toBe(404)

    const log = await (await owner('/api/admin/audit?action=user.')).json()
    expect(log.entries.map((e: { action: string }) => e.action)).toEqual(['user.deleted', 'user.password_reset_sent', 'user.reactivated', 'user.suspended'])
  })

  it('adds up growth and book analytics for a date range, in the owner’s time zone', async () => {
    const { query } = await import('./db.js')
    const DAY = 86_400_000
    const owner = browser()
    await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-2' } })
    const ana = browser()
    await ana('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ana@example.test', password: 'new-crayons-1' } })
    expect((await ana('/api/admin/analytics')).status).toBe(403)
    const anaId = (await (await ana('/api/me')).json()).id

    // A clean slate of activity: two days of Ana's family coloring.
    await query('delete from app_event')
    await query('delete from app_artwork')
    const to = Date.UTC(2026, 10, 20, 12) // noon UTC, 20 Nov
    const at = (daysAgo: number, hour = 10) => Date.UTC(2026, 10, 20 - daysAgo, hour)
    const ev = (uid: string, type: string, t: number, page: string | null, ms?: number) =>
      query(`insert into app_event (uid, user_id, profile_id, type, book_id, page_id, at, data, server_at) values ($1,$2,'kid-1',$3,'cozy-christmas',$4,$5,$6,$5)`, [uid, anaId, type, page, t, ms ? JSON.stringify({ ms }) : null])
    await ev('a1', 'book_open', at(1), null)
    await ev('a2', 'color_open', at(1), 'p01')
    await ev('a3', 'coloring', at(1), 'p01', 120_000)
    await ev('a4', 'book_open', at(0, 9), null)
    await ev('a5', 'color_open', at(0, 9), 'p02')
    await ev('a6', 'coloring', at(0, 9), 'p02', 60_000)
    await ev('a7', 'color_open', at(0, 9), 'p01')
    await query(`insert into app_artwork (id, user_id, profile_id, book_id, page_id, progress, completed_at, updated_at, deleted, server_at) values ('w1',$1,'kid-1','cozy-christmas','p01',1,$2,$2,false,$2), ('w2',$1,'kid-1','cozy-christmas','p02',0.4,null,$3,false,$3)`, [anaId, at(1), at(0, 9)])

    const res = await (await owner(`/api/admin/analytics?from=${to - 7 * DAY}&to=${to}&tz=0`)).json()
    expect(res.days).toHaveLength(8) // 13 Nov noon … 20 Nov noon touches eight calendar days
    expect(res.days.at(-1)).toMatchObject({ activeFamilies: 1, coloringMs: 60_000 })
    expect(res.days.at(-2)).toMatchObject({ activeFamilies: 1, coloringMs: 120_000, pagesFinished: 1 })
    expect(res.totals).toMatchObject({ activeToday: 1, activeWeek: 1, activeMonth: 1, pagesFinished: 1, coloringMs: 180_000 })
    expect(res.books).toEqual([{ bookId: 'cozy-christmas', opens: 2, families: 1, children: 1, coloringMs: 180_000, pagesStarted: 2, pagesFinished: 1 }])
    expect(res.pages[0]).toMatchObject({ bookId: 'cozy-christmas', pageId: 'p01', opens: 2, coloringMs: 120_000 })
    expect(res.planMix.free + res.planMix.trial + res.planMix.premium).toBe(res.totals.families)

    // Fourteen hours ahead of UTC, both sessions (10:00 UTC on the 19th, 09:00 UTC on the 20th) fall on the local
    // 20th, and the range ends at 02:00 on the local 21st.
    const ahead = await (await owner(`/api/admin/analytics?from=${to - 7 * DAY}&to=${to}&tz=-840`)).json()
    expect(ahead.days.at(-2).coloringMs).toBe(180_000)
    expect(ahead.days.at(-1).coloringMs).toBe(0)
    expect((await owner(`/api/admin/analytics?from=${to}&to=${to - DAY}`)).status).toBe(400)
  })

  it('welcomes new families, sends weekly summaries and book news, and honours unsubscribe links', async () => {
    const { query } = await import('./db.js')
    const emails = await import('./emails.js')
    const { mailbox } = email
    const owner = browser()
    await owner('/api/auth/sign-in/username', { method: 'POST', json: { username: 'boss', password: 'owner-password-2' } })

    // Welcome: once, when the family is first set up.
    const eve = browser()
    await eve('/api/auth/sign-up/email', { method: 'POST', json: { name: 'Eve Example', email: 'eve@example.test', password: 'crayons-999' } })
    const me = await (await eve('/api/me')).json()
    await eve('/api/me')
    const welcomes = mailbox.filter((m) => m.to === 'eve@example.test' && m.subject === 'Welcome to Little Lines')
    expect(welcomes).toHaveLength(1)
    expect(welcomes[0].html).toContain('Welcome, Eve!')
    expect(welcomes[0].text).toContain('Open Little Lines')
    expect(me.emailPrefs).toEqual({ weekly: true, news: true })

    // Weekly: Eve's child colored this week, so Eve gets one; a second run sends nothing new.
    await query(`insert into app_profile (id, user_id, name, avatar, color, created_at, updated_at, deleted, server_at) values ('kid-eve', $1, 'Pip', 'fox', 'sky', 1, 1, false, 1)`, [me.id])
    await query(`insert into app_event (uid, user_id, profile_id, type, book_id, page_id, at, data, server_at) values ('ev-eve', $1, 'kid-eve', 'coloring', 'cozy-christmas', 'p01', $2, '{"ms":300000}', $2)`, [me.id, Date.now() - 60_000])
    const first = await emails.sendWeeklyDigests()
    expect(first.sent).toBeGreaterThanOrEqual(1)
    const weekly = mailbox.filter((m) => m.to === 'eve@example.test' && m.subject === 'Pip’s week in Little Lines')
    expect(weekly).toHaveLength(1)
    expect(weekly[0].html).toContain('5 min')
    expect(weekly[0].headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click')
    const second = await emails.sendWeeklyDigests()
    expect(second.sent).toBe(0)
    expect(second.skipped).toBe(first.sent)

    // The cron route needs the secret.
    expect((await fetch(`${base}/api/cron/weekly-digest`)).status).toBe(401)
    process.env.CRON_SECRET = 'cron-test-secret'
    expect((await fetch(`${base}/api/cron/weekly-digest`, { headers: { authorization: 'Bearer wrong' } })).status).toBe(401)
    expect(await (await fetch(`${base}/api/cron/weekly-digest`, { headers: { authorization: 'Bearer cron-test-secret' } })).json()).toMatchObject({ sent: 0 })
    delete process.env.CRON_SECRET

    // Unsubscribe link: opening it only asks; confirming turns weekly emails off; a changed link does nothing.
    const link = new URL(emails.unsubscribeUrl(me.id, 'weekly'))
    const path = `/api/email/unsubscribe${link.search}`
    const opened = await fetch(base + path)
    expect(await opened.text()).toContain('<form method="post">')
    expect((await (await eve('/api/me')).json()).emailPrefs.weekly).toBe(true)
    expect((await fetch(base + path.replace(/t=[^&]+/, 't=forged'), { method: 'POST' })).status).toBe(400)
    const done = await fetch(base + path, { method: 'POST' })
    expect(await done.text()).toContain('unsubscribed')
    expect((await (await eve('/api/me')).json()).emailPrefs).toEqual({ weekly: false, news: true })
    // Mail apps' one-click unsubscribe, for book news.
    const news = new URL(emails.unsubscribeUrl(me.id, 'news'))
    const oneClick = await fetch(`${base}/api/email/unsubscribe${news.search}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'List-Unsubscribe=One-Click' })
    expect(await oneClick.text()).toBe('Unsubscribed')
    // …and back on from Grown-ups.
    expect(await (await eve('/api/me/email-prefs', { method: 'PUT', json: { news: true } })).json()).toEqual({ weekly: false, news: true })

    // New book announcement: published books only, once per family.
    const meta = { title: 'Dino Days', subtitle: 'Big and small', category: 'Animals', pageSize: { width: 1600, height: 2263 } }
    const id = (await (await owner('/api/admin/books', { method: 'POST', json: { meta, pages: [{ id: 'p01', kind: 'line-art', title: 'T. rex' }] } })).json()).id
    expect((await owner(`/api/admin/books/${id}/announce`, { method: 'POST', json: {} })).status).toBe(400)
    for (const key of ['p01', 'p01-thumb']) await owner(`/api/admin/books/${id}/image?key=${key}`, { method: 'PUT', headers: { 'content-type': 'image/png' }, body: new Uint8Array([1, 2]) })
    await owner(`/api/admin/books/${id}/status`, { method: 'PUT', json: { status: 'published' } })
    const before = await (await owner(`/api/admin/books/${id}/announce`)).json()
    expect(before).toMatchObject({ announcedAt: null, sentTo: 0 })
    const sent = await (await owner(`/api/admin/books/${id}/announce`, { method: 'POST', json: {} })).json()
    expect(sent.sent).toBe(before.recipients)
    expect(mailbox.some((m) => m.to === 'eve@example.test' && m.subject === 'New in Little Lines: Dino Days')).toBe(true)
    expect((await (await owner(`/api/admin/books/${id}/announce`, { method: 'POST', json: {} })).json()).sent).toBe(0)
    expect((await (await owner(`/api/admin/books/${id}/announce`)).json()).announcedAt).toBeGreaterThan(0)

    // Owner console: overview, preview, a test to the owner; families can't use any of it.
    expect((await eve('/api/admin/emails')).status).toBe(403)
    const overview = await (await owner('/api/admin/emails')).json()
    expect(overview).toMatchObject({ configured: false, cronConfigured: false })
    expect(overview.log.some((l: { kind: string; status: string }) => l.kind === 'new_book' && l.status === 'logged')).toBe(true)
    expect(overview.subscribers.weekly).toBeLessThan(overview.subscribers.families)
    const pv = await (await owner('/api/admin/emails/preview?kind=weekly')).json()
    expect(pv.subject).toBe('Maya’s week in Little Lines')
    expect((await owner('/api/admin/emails/preview?kind=nope')).status).toBe(400)
    expect(await (await owner('/api/admin/emails/test', { method: 'POST', json: { kind: 'welcome' } })).json()).toEqual({ status: 'logged', to: 'boss@example.test' })
    expect(mailbox.at(-1)!.subject).toBe('[Test] Welcome to Little Lines')
    const audit = await (await owner('/api/admin/audit?action=email.')).json()
    expect(audit.entries.map((e: { action: string }) => e.action)).toEqual(['email.announced', 'email.announced'])
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
