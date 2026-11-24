import type { IncomingMessage, ServerResponse } from 'node:http'
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node'
import { listAudit } from './audit.js'
import { getAuth } from './auth.js'
import { query } from './db.js'
import { googleEnabled } from './env.js'

/**
 * Every /api request. Runs as one Vercel function in production and inside the
 * Vite dev server locally (see vite.config.ts), so both behave the same.
 *
 *   /api/auth/*        sign-in, sign-up, Google, password reset (Better Auth)
 *   /api/config        which sign-in options are switched on
 *   /api/me            the signed-in family; PUT /api/me/pin sets the parent PIN
 *   /api/sync          pull changes since a time (GET) and push local changes (POST)
 *   /api/blob?key=     page images and colorings (GET / PUT)
 *   /api/admin/*       the owner console (owner only): overview, audit log
 */

const MAX_JSON = 2 * 1024 * 1024
const MAX_BLOB = 8 * 1024 * 1024

type Row = Record<string, unknown>

class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Vercel rewrites /api/anything to this one function as /api?__path=anything.
  const url = new URL(req.url ?? '/', 'http://local')
  const rewritten = url.searchParams.get('__path')
  if (rewritten !== null) {
    url.searchParams.delete('__path')
    url.pathname = `/api/${rewritten}`.replace(/\/+$/, '') || '/api'
    req.url = url.pathname + (url.search ? url.search : '')
  }
  const path = url.pathname

  try {
    if (path.startsWith('/api/auth/') || path === '/api/auth') {
      await toNodeHandler(getAuth())(req, res)
      return
    }
    if (path === '/api/config' && req.method === 'GET') return json(res, 200, { google: googleEnabled() })

    const user = await requireUser(req)
    if (path === '/api/me' && req.method === 'GET') return json(res, 200, await me(user))
    if (path === '/api/me/pin' && req.method === 'PUT') {
      const body = (await readJson(req)) as { parentPinHash?: unknown }
      if (typeof body.parentPinHash !== 'string' || !body.parentPinHash.startsWith('pbkdf2-sha256$'))
        throw new HttpError(400, 'parentPinHash must be a PBKDF2 hash')
      await ensureFamily(user.id)
      await query('update app_family set parent_pin_hash = $2 where user_id = $1', [user.id, body.parentPinHash])
      return json(res, 200, await me(user))
    }
    if (path === '/api/sync' && req.method === 'GET') return json(res, 200, await pull(user.id, Number(url.searchParams.get('since') ?? 0)))
    if (path === '/api/sync' && req.method === 'POST') return json(res, 200, await push(user.id, (await readJson(req)) as SyncPush))
    if (path === '/api/blob') {
      const key = url.searchParams.get('key') ?? ''
      if (!/^(art|book):[\w:./-]{3,200}$/.test(key)) throw new HttpError(400, 'Bad key')
      if (req.method === 'GET') return await getBlob(res, user.id, key)
      if (req.method === 'PUT') {
        // Images for a book this family doesn't already have are dropped (see push()).
        if (key.startsWith('book:')) {
          const bookId = key.slice(5).split('/')[0]
          const owned = await query('select 1 from app_book where id = $1 and user_id = $2', [bookId, user.id])
          if (!owned.rowCount) {
            await readBody(req, MAX_BLOB)
            return json(res, 200, { ok: true, ignored: true })
          }
        }
        return await putBlob(req, res, user.id, key)
      }
    }
    if (path.startsWith('/api/admin/')) {
      await requireOwner(user.id)
      if (path === '/api/admin/overview' && req.method === 'GET') return json(res, 200, await adminOverview())
      if (path === '/api/admin/audit' && req.method === 'GET')
        return json(
          res,
          200,
          await listAudit({
            before: Number(url.searchParams.get('before')) || undefined,
            action: url.searchParams.get('action') ?? undefined,
            limit: Number(url.searchParams.get('limit')) || 50,
          }),
        )
    }
    throw new HttpError(404, 'Not found')
  } catch (err) {
    if (err instanceof HttpError) return json(res, err.status, { error: err.message })
    console.error('[api]', err)
    return json(res, 500, { error: 'Something went wrong on the server.' })
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const b = typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer)
    size += b.length
    if (size > limit) throw new HttpError(413, 'Too large')
    chunks.push(b)
  }
  return Buffer.concat(chunks)
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const buf = await readBody(req, MAX_JSON)
  try {
    return buf.length ? JSON.parse(buf.toString('utf8')) : {}
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

interface SessionUser {
  id: string
  email: string
  name: string
}

async function requireUser(req: IncomingMessage): Promise<SessionUser> {
  const session = await getAuth().api.getSession({ headers: fromNodeHeaders(req.headers) })
  if (!session) throw new HttpError(401, 'Sign in first')
  return { id: session.user.id, email: session.user.email, name: session.user.name }
}

/** Creates the family row on first use. Everyone is a grown-up; the owner is made by npm run owner:create. */
async function ensureFamily(userId: string) {
  await query(
    `insert into app_family (user_id, role, created_at) values ($1, 'parent', $2) on conflict (user_id) do nothing`,
    [userId, Date.now()],
  )
}

async function requireOwner(userId: string) {
  const { rows } = await query<{ role: string }>('select role from app_family where user_id = $1', [userId])
  if (rows[0]?.role !== 'owner') throw new HttpError(403, 'Only the owner can open this')
}

async function me(user: SessionUser) {
  await ensureFamily(user.id)
  const { rows } = await query<{ role: string; parent_pin_hash: string | null; created_at: string }>(
    'select role, parent_pin_hash, created_at from app_family where user_id = $1',
    [user.id],
  )
  const f = rows[0]
  const methods = await query<{ providerId: string }>('select "providerId" from account where "userId" = $1', [user.id])
  const u = await query<{ username: string | null }>('select username from "user" where id = $1', [user.id])
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    username: u.rows[0]?.username ?? null,
    role: f.role,
    parentPinHash: f.parent_pin_hash,
    createdAt: Number(f.created_at),
    signInMethods: methods.rows.map((r) => (r.providerId === 'credential' ? 'password' : r.providerId)),
  }
}

// ── Sync ───────────────────────────────────────────────────────────────────

export interface SyncPush {
  profiles?: Row[]
  artworks?: Row[]
  events?: Row[]
  books?: Row[]
}

const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '')
const optStr = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null)

/**
 * Upserts are last-write-wins on `updated_at`, and only ever touch rows owned by
 * this family. `server_at` records when the server saw the change, which is what
 * other devices pull by.
 */
async function push(userId: string, body: SyncPush) {
  const now = Date.now()
  let accepted = 0
  for (const p of (body.profiles ?? []).slice(0, 50)) {
    await query(
      `insert into app_profile (id, user_id, name, avatar, color, pin_hash, created_at, last_active_at, updated_at, deleted, server_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do update set name=excluded.name, avatar=excluded.avatar, color=excluded.color, pin_hash=excluded.pin_hash,
         last_active_at=excluded.last_active_at, updated_at=excluded.updated_at, deleted=excluded.deleted, server_at=excluded.server_at
       where app_profile.user_id = excluded.user_id and excluded.updated_at >= app_profile.updated_at`,
      [str(p.id, 64), userId, str(p.name, 40), str(p.avatar, 32), str(p.color, 32), optStr(p.pinHash, 300), num(p.createdAt, now), p.lastActiveAt == null ? null : num(p.lastActiveAt), num(p.updatedAt, now), p.deleted === true, now],
    )
    accepted++
  }
  for (const a of (body.artworks ?? []).slice(0, 200)) {
    await query(
      `insert into app_artwork (id, user_id, profile_id, book_id, page_id, progress, completed_at, finished_by_child, has_layer, updated_at, deleted, server_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (id) do update set progress=excluded.progress, completed_at=excluded.completed_at, finished_by_child=excluded.finished_by_child,
         has_layer=excluded.has_layer, updated_at=excluded.updated_at, deleted=excluded.deleted, server_at=excluded.server_at
       where app_artwork.user_id = excluded.user_id and excluded.updated_at >= app_artwork.updated_at`,
      [str(a.id, 300), userId, str(a.profileId, 64), str(a.bookId, 100), str(a.pageId, 100), Math.max(0, Math.min(1, num(a.progress))), a.completedAt == null ? null : num(a.completedAt), a.finishedByChild === true, a.hasLayer === true, num(a.updatedAt, now), a.deleted === true, now],
    )
    accepted++
  }
  for (const e of (body.events ?? []).slice(0, 500)) {
    await query(
      `insert into app_event (uid, user_id, profile_id, type, book_id, page_id, at, data, server_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict (uid) do nothing`,
      [str(e.uid, 64), userId, optStr(e.profileId, 64), str(e.type, 32), optStr(e.bookId, 100), optStr(e.pageId, 100), num(e.at, now), e.data && typeof e.data === 'object' ? JSON.stringify(e.data).slice(0, 4000) : null, now],
    )
    accepted++
  }
  // Grown-ups can no longer add books (only the owner can, from the console), so a
  // book the server doesn't already have is ignored rather than refused: refusing
  // would leave it stuck in that device's outbox and hold up everything after it.
  for (const b of (body.books ?? []).slice(0, 20)) {
    await query(
      `update app_book set meta=$3, updated_at=$4, deleted=$5, server_at=$6
       where id = $1 and user_id = $2 and $4 >= updated_at`,
      [str(b.id, 64), userId, JSON.stringify(b.meta ?? {}), num(b.updatedAt, now), b.deleted === true, now],
    )
    if (b.deleted === true) await query(`delete from app_blob where user_id = $1 and key like $2`, [userId, `book:${str(b.id, 64)}/%`])
    accepted++
  }
  return { accepted, serverTime: now }
}

async function pull(userId: string, since: number) {
  // Report a cursor slightly in the past so writes that land during this request aren't missed.
  const cursor = Date.now() - 2000
  const s = Number.isFinite(since) ? since : 0
  const [profiles, artworks, events, books] = await Promise.all([
    query('select * from app_profile where user_id = $1 and server_at > $2', [userId, s]),
    query('select * from app_artwork where user_id = $1 and server_at > $2', [userId, s]),
    query('select * from app_event where user_id = $1 and server_at > $2 order by at limit 5000', [userId, s]),
    query('select * from app_book where user_id = $1 and server_at > $2', [userId, s]),
  ])
  return {
    cursor,
    profiles: profiles.rows.map((r) => ({
      id: r.id,
      name: r.name,
      avatar: r.avatar,
      color: r.color,
      pinHash: r.pin_hash,
      createdAt: Number(r.created_at),
      lastActiveAt: r.last_active_at == null ? null : Number(r.last_active_at),
      updatedAt: Number(r.updated_at),
      deleted: r.deleted,
    })),
    artworks: artworks.rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      bookId: r.book_id,
      pageId: r.page_id,
      progress: Number(r.progress),
      completedAt: r.completed_at == null ? null : Number(r.completed_at),
      finishedByChild: r.finished_by_child,
      hasLayer: r.has_layer,
      updatedAt: Number(r.updated_at),
      deleted: r.deleted,
    })),
    events: events.rows.map((r) => ({
      uid: r.uid,
      profileId: r.profile_id,
      type: r.type,
      bookId: r.book_id ?? undefined,
      pageId: r.page_id ?? undefined,
      at: Number(r.at),
      data: r.data ?? undefined,
    })),
    books: books.rows.map((r) => ({ id: r.id, meta: r.meta, updatedAt: Number(r.updated_at), deleted: r.deleted })),
  }
}

// ── Images ─────────────────────────────────────────────────────────────────

async function getBlob(res: ServerResponse, userId: string, key: string) {
  const { rows } = await query<{ content_type: string; data: Buffer }>('select content_type, data from app_blob where key = $1 and user_id = $2', [key, userId])
  if (!rows[0]) throw new HttpError(404, 'Not found')
  res.statusCode = 200
  res.setHeader('content-type', rows[0].content_type)
  res.setHeader('cache-control', 'private, no-cache')
  res.end(rows[0].data)
}

async function putBlob(req: IncomingMessage, res: ServerResponse, userId: string, key: string) {
  const type = String(req.headers['content-type'] ?? 'application/octet-stream')
  if (!/^image\/(png|jpeg|webp)$/.test(type)) throw new HttpError(415, 'Only PNG, JPEG or WebP images')
  const data = await readBody(req, MAX_BLOB)
  const result = await query(
    `insert into app_blob (key, user_id, content_type, data, updated_at) values ($1,$2,$3,$4,$5)
     on conflict (key) do update set content_type=excluded.content_type, data=excluded.data, updated_at=excluded.updated_at
     where app_blob.user_id = excluded.user_id`,
    [key, userId, type, data, Date.now()],
  )
  if (result.rowCount === 0) throw new HttpError(403, 'Not yours')
  json(res, 200, { ok: true, bytes: data.length })
}

// ── Admin ──────────────────────────────────────────────────────────────────

async function adminOverview() {
  const since = Date.now() - 60 * 24 * 60 * 60 * 1000
  const [families, profiles, events, finished] = await Promise.all([
    query(`select u.id, u.name, u.email, f.role, f.created_at,
             (select max(s."createdAt") from session s where s."userId" = u.id) as last_login
           from "user" u join app_family f on f.user_id = u.id where f.role <> 'owner'`),
    query('select id, user_id from app_profile where not deleted'),
    query(
      `select user_id, profile_id, type, book_id, page_id, at, (data->>'ms')::bigint as ms,
         coalesce((data->>'strokes')::int, 0) + coalesce((data->>'fills')::int, 0) + coalesce((data->>'erases')::int, 0) as actions
       from app_event where at > $1 and type in ('color_open', 'coloring')`,
      [since],
    ),
    query('select count(*)::int as n from app_artwork where completed_at is not null and not deleted'),
  ])
  return {
    families: families.rows.map((f) => ({
      id: f.id,
      name: f.name,
      email: f.email,
      role: f.role,
      createdAt: Number(f.created_at),
      lastLoginAt: f.last_login ? new Date(f.last_login).getTime() : Number(f.created_at),
    })),
    profiles: profiles.rows.map((p) => ({ id: p.id, accountId: p.user_id })),
    events: events.rows.map((e) => ({
      accountId: e.user_id,
      profileId: e.profile_id,
      type: e.type,
      bookId: e.book_id ?? undefined,
      pageId: e.page_id ?? undefined,
      at: Number(e.at),
      data: e.type === 'coloring' ? { ms: Number(e.ms ?? 0), strokes: Number(e.actions ?? 0) } : undefined,
    })),
    pagesFinished: finished.rows[0]?.n ?? 0,
  }
}
