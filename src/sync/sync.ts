import { create } from 'zustand'
import { api, type PushBody, type RemoteArtwork, type RemoteBook, type RemoteProfile } from '../data/api'
import { db } from '../data/db'
import type { OutboxEntry, StoredBook } from '../data/types'

/**
 * Keeps this device and the server in step. Every local change goes into the
 * outbox (one entry per profile, artwork, event or book); a sync sends the
 * outbox, then pulls whatever other devices changed since the last pull.
 * Conflicts resolve last-write-wins by `updatedAt`.
 */

type SyncState = { status: 'idle' | 'syncing' | 'offline' | 'error'; lastSynced: number | null; pending: number }

export const useSync = create<SyncState>(() => ({ status: 'idle', lastSynced: null, pending: 0 }))

let accountId: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let running: Promise<void> | null = null
let again = false
const listeners = new Set<() => void>()

/** Called after pulls that changed books, so the library can reload. */
export function onBooksChanged(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

const cursorKey = (id: string) => `little-lines:cursor:${id}`
function readCursor(id: string): number {
  try {
    return Number(localStorage.getItem(cursorKey(id)) ?? 0) || 0
  } catch {
    return 0
  }
}
function writeCursor(id: string, v: number) {
  try {
    localStorage.setItem(cursorKey(id), String(v))
  } catch {
    /* next sync pulls a little more */
  }
}

/** Starts syncing for a signed-in family; stops when called with null. */
export function startSync(id: string | null) {
  accountId = id
  clearTimeout(timer)
  if (id) void syncNow()
}

export async function enqueue(kind: OutboxEntry['kind'], ref: string): Promise<void> {
  await db.outbox.put({ key: `${kind}:${ref}`, kind, ref, at: Date.now() })
  useSync.setState({ pending: await db.outbox.count() })
  scheduleSync()
}

export function scheduleSync(delay = 1500) {
  clearTimeout(timer)
  timer = setTimeout(() => void syncNow(), delay)
}

export async function syncNow(): Promise<void> {
  if (!accountId) return
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    const id = accountId!
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      useSync.setState({ status: 'offline', pending: await db.outbox.count() })
      return
    }
    useSync.setState({ status: 'syncing' })
    try {
      await pushOutbox()
      await pullChanges(id)
      useSync.setState({ status: 'idle', lastSynced: Date.now(), pending: await db.outbox.count() })
    } catch (err) {
      const offline = err instanceof Error && /offline|Failed to fetch/i.test(err.message)
      useSync.setState({ status: offline ? 'offline' : 'error', pending: await db.outbox.count() })
    }
  })()
  try {
    await running
  } finally {
    running = null
    if (again) {
      again = false
      scheduleSync(300)
    }
  }
}

// ── Push ───────────────────────────────────────────────────────────────────

async function pushOutbox() {
  const entries = await db.outbox.toArray()
  if (entries.length === 0) return
  const body: Required<PushBody> = { profiles: [], artworks: [], events: [], books: [] }
  for (const e of entries.slice(0, 200)) {
    if (e.kind === 'profile') {
      const p = await db.profiles.get(e.ref)
      body.profiles.push(
        p
          ? { id: p.id, name: p.name, avatar: p.avatar, color: p.color, pinHash: p.pinHash, createdAt: p.createdAt, lastActiveAt: p.lastActiveAt, updatedAt: p.updatedAt ?? p.createdAt }
          : { id: e.ref, name: '', avatar: '', color: '', pinHash: null, createdAt: e.at, lastActiveAt: null, updatedAt: e.at, deleted: true },
      )
    } else if (e.kind === 'artwork') {
      const a = await db.artworks.get(e.ref)
      if (a) {
        if (a.colorLayer) await api.putBlob(`art:${a.id}:layer`, a.colorLayer)
        if (a.thumb) await api.putBlob(`art:${a.id}:thumb`, a.thumb)
      }
      body.artworks.push(
        a
          ? { id: a.id, profileId: a.profileId, bookId: a.bookId, pageId: a.pageId, progress: a.progress, completedAt: a.completedAt, finishedByChild: Boolean(a.finishedByChild), hasLayer: Boolean(a.colorLayer), updatedAt: a.updatedAt }
          : { ...tombstoneArtwork(e.ref), updatedAt: e.at },
      )
    } else if (e.kind === 'event') {
      const ev = await db.events.where('uid').equals(e.ref).first()
      if (ev) body.events.push({ uid: e.ref, profileId: ev.profileId, type: ev.type, bookId: ev.bookId, pageId: ev.pageId, at: ev.at, data: ev.data })
    } else if (e.kind === 'book') {
      const b = await db.books.get(e.ref)
      if (b) {
        const keys = b.pages.flatMap((p) => [p.image, p.thumb])
        for (const key of keys) {
          const f = await db.bookFiles.get(key)
          if (f) await api.putBlob(`book:${key}`, f.blob)
        }
      }
      body.books.push(b ? { id: b.id, meta: b as unknown as Record<string, unknown>, updatedAt: b.updatedAt ?? b.createdAt, deleted: false } : { id: e.ref, meta: {}, updatedAt: e.at, deleted: true })
    }
  }
  await api.push(body)
  // Remove what was sent, unless it changed again while sending.
  await db.transaction('rw', db.outbox, async () => {
    for (const e of entries.slice(0, 200)) {
      const now = await db.outbox.get(e.key)
      if (now && now.at === e.at) await db.outbox.delete(e.key)
    }
  })
}

function tombstoneArtwork(id: string): Omit<RemoteArtwork, 'updatedAt'> {
  const [profileId = '', bookId = '', pageId = ''] = id.split(':')
  return { id, profileId, bookId, pageId, progress: 0, completedAt: null, finishedByChild: false, hasLayer: false, deleted: true }
}

// ── Pull ───────────────────────────────────────────────────────────────────

async function pullChanges(id: string) {
  const since = readCursor(id)
  const res = await api.pull(since)
  await applyProfiles(id, res.profiles)
  await applyArtworks(res.artworks)
  if (res.events.length) {
    const known = new Set((await db.events.where('uid').anyOf(res.events.map((e) => e.uid)).toArray()).map((e) => e.uid))
    const fresh = res.events.filter((e) => !known.has(e.uid))
    if (fresh.length)
      await db.events.bulkAdd(
        fresh.map((e) => ({ uid: e.uid, accountId: id, profileId: e.profileId, type: e.type, bookId: e.bookId, pageId: e.pageId, at: e.at, data: e.data })),
      )
  }
  if (res.books.length && (await applyBooks(id, res.books))) listeners.forEach((fn) => fn())
  writeCursor(id, res.cursor)
}

async function applyProfiles(accountId: string, rows: RemoteProfile[]) {
  for (const r of rows) {
    if (await db.outbox.get(`profile:${r.id}`)) continue // a newer local change is on its way up
    const local = await db.profiles.get(r.id)
    if (r.deleted) {
      if (local) {
        await db.transaction('rw', db.profiles, db.artworks, async () => {
          await db.artworks.where('profileId').equals(r.id).delete()
          await db.profiles.delete(r.id)
        })
      }
      continue
    }
    if (local && (local.updatedAt ?? 0) > r.updatedAt) continue
    await db.profiles.put({
      id: r.id,
      accountId,
      name: r.name,
      avatar: r.avatar,
      color: r.color,
      pinHash: r.pinHash,
      createdAt: r.createdAt,
      lastActiveAt: r.lastActiveAt,
      updatedAt: r.updatedAt,
    })
  }
}

async function applyArtworks(rows: RemoteArtwork[]) {
  for (const r of rows) {
    if (await db.outbox.get(`artwork:${r.id}`)) continue
    const local = await db.artworks.get(r.id)
    if (r.deleted) {
      if (local && local.updatedAt <= r.updatedAt) await db.artworks.delete(r.id)
      continue
    }
    if (local && local.updatedAt >= r.updatedAt) continue
    const [colorLayer, thumb] = r.hasLayer
      ? await Promise.all([api.getBlob(`art:${r.id}:layer`), api.getBlob(`art:${r.id}:thumb`)])
      : [null, null]
    await db.artworks.put({
      id: r.id,
      profileId: r.profileId,
      bookId: r.bookId,
      pageId: r.pageId,
      colorLayer,
      thumb,
      progress: r.progress,
      completedAt: r.completedAt,
      finishedByChild: r.finishedByChild,
      updatedAt: r.updatedAt,
    })
  }
}

async function applyBooks(accountId: string, rows: RemoteBook[]): Promise<boolean> {
  let changed = false
  for (const r of rows) {
    if (await db.outbox.get(`book:${r.id}`)) continue
    const local = await db.books.get(r.id)
    if (r.deleted) {
      if (local) {
        await db.transaction('rw', db.books, db.bookFiles, async () => {
          await db.bookFiles.where('bookId').equals(r.id).delete()
          await db.books.delete(r.id)
        })
        changed = true
      }
      continue
    }
    if (local && (local.updatedAt ?? local.createdAt) >= r.updatedAt) continue
    const meta = { ...(r.meta as unknown as StoredBook), createdBy: accountId }
    const keys = meta.pages.flatMap((p) => [p.image, p.thumb])
    const files: Array<{ key: string; bookId: string; blob: Blob }> = []
    for (const key of keys) {
      const blob = await api.getBlob(`book:${key}`)
      if (blob) files.push({ key, bookId: meta.id, blob })
    }
    await db.transaction('rw', db.books, db.bookFiles, async () => {
      await db.bookFiles.bulkPut(files)
      await db.books.put(meta)
    })
    changed = true
  }
  return changed
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => scheduleSync(200))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleSync(200)
  })
  setInterval(() => scheduleSync(0), 60_000)
}
