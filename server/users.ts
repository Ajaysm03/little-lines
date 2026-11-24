import { audit } from './audit.js'
import { getAuth } from './auth.js'
import { query } from './db.js'
import { env } from './env.js'
import { rowToPlan } from './plans.js'

/**
 * The owner's view of every family account, and what the owner can do to one:
 * suspend or reactivate it, send a password reset, or delete it. Suspension
 * is "user"."suspendedAt" (a Better Auth field, checked at every sign-in);
 * the owner's reason for it is kept with the family.
 */
export const USERS_SCHEMA = `
alter table app_family add column if not exists suspended_reason text;
alter table app_family add column if not exists last_login_at bigint;
`

export const INACTIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000

export type UserStatus = 'active' | 'inactive' | 'never-started' | 'suspended'

/**
 * Suspended wins; then a family that has never colored is "never started";
 * otherwise active if they signed in or colored in the last 30 days.
 */
export function userStatus(u: { suspendedAt: number | null; lastLoginAt: number | null; lastColoringAt: number | null }, now = Date.now()): UserStatus {
  if (u.suspendedAt) return 'suspended'
  if (!u.lastColoringAt) return 'never-started'
  const last = Math.max(u.lastLoginAt ?? 0, u.lastColoringAt)
  return now - last <= INACTIVE_AFTER_MS ? 'active' : 'inactive'
}

export class UserError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Actor {
  id: string
  label: string
}

const n = (v: unknown) => (v == null ? null : Number(v))
const toMs = (v: unknown) => (v == null ? null : v instanceof Date ? v.getTime() : Number.isFinite(Number(v)) ? Number(v) : new Date(String(v)).getTime())

const USER_SELECT = `
  select u.id, u.name, u.email, u.username, u."emailVerified", u."suspendedAt" as suspended_at, f.*,
    greatest(f.last_login_at, (select (extract(epoch from max(s."createdAt")) * 1000)::bigint from session s where s."userId" = u.id)) as last_login,
    (select max(e.at) from app_event e where e.user_id = u.id and e.type in ('coloring', 'color_open')) as last_coloring,
    (select count(*)::int from app_profile p where p.user_id = u.id and not p.deleted) as children,
    (select count(*)::int from app_artwork a where a.user_id = u.id and not a.deleted and a.progress > 0) as pages_colored,
    (select count(*)::int from app_artwork a where a.user_id = u.id and not a.deleted and a.completed_at is not null) as pages_finished,
    (select coalesce(sum((e.data->>'ms')::bigint), 0) from app_event e where e.user_id = u.id and e.type = 'coloring') as coloring_ms,
    (select array_agg(a."providerId") from account a where a."userId" = u.id) as providers
  from "user" u join app_family f on f.user_id = u.id
  where f.role <> 'owner'`

function rowToUser(r: Record<string, unknown>, now = Date.now()) {
  const suspendedAt = toMs(r.suspended_at)
  const lastLoginAt = toMs(r.last_login)
  const lastColoringAt = n(r.last_coloring)
  return {
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    joinedAt: Number(r.created_at),
    lastLoginAt,
    lastColoringAt,
    status: userStatus({ suspendedAt, lastLoginAt, lastColoringAt }, now),
    suspendedAt,
    suspendedReason: (r.suspended_reason as string | null) ?? null,
    children: Number(r.children ?? 0),
    pagesColored: Number(r.pages_colored ?? 0),
    pagesFinished: Number(r.pages_finished ?? 0),
    coloringMs: Number(r.coloring_ms ?? 0),
    signInMethods: ((r.providers as string[] | null) ?? []).map((p) => (p === 'credential' ? 'password' : p)),
    plan: rowToPlan(r, now),
  }
}

export type AdminUser = ReturnType<typeof rowToUser>

export async function listUsers() {
  const now = Date.now()
  const { rows } = await query(`${USER_SELECT} order by f.created_at desc`)
  return { users: rows.map((r) => rowToUser(r, now)), inactiveAfterDays: INACTIVE_AFTER_MS / 86_400_000 }
}

export async function getUser(id: string) {
  const { rows } = await query(`${USER_SELECT} and u.id = $1`, [id])
  if (!rows[0]) throw new UserError(404, 'That account doesn’t exist.')
  const user = rowToUser(rows[0])

  const [children, events, books] = await Promise.all([
    query(
      `select p.id, p.name, p.avatar, p.color, p.created_at, p.last_active_at, (p.pin_hash is not null) as has_pin,
         (select count(*)::int from app_artwork a where a.profile_id = p.id and not a.deleted and a.progress > 0) as pages_colored,
         (select count(*)::int from app_artwork a where a.profile_id = p.id and not a.deleted and a.completed_at is not null) as pages_finished,
         (select coalesce(sum((e.data->>'ms')::bigint), 0) from app_event e where e.profile_id = p.id and e.type = 'coloring') as coloring_ms
       from app_profile p where p.user_id = $1 and not p.deleted order by p.created_at`,
      [id],
    ),
    query(
      `select e.type, e.profile_id, e.book_id, e.page_id, e.at, e.data from app_event e
       where e.user_id = $1 order by e.at desc limit 40`,
      [id],
    ),
    query(
      `select a.book_id, count(*) filter (where a.progress > 0)::int as pages_colored,
         count(*) filter (where a.completed_at is not null)::int as pages_finished, max(a.updated_at) as last_at
       from app_artwork a where a.user_id = $1 and not a.deleted group by a.book_id order by max(a.updated_at) desc`,
      [id],
    ),
  ])
  return {
    ...user,
    children: children.rows.map((c) => ({
      id: c.id as string,
      name: c.name as string,
      avatar: c.avatar as string,
      color: c.color as string,
      hasPin: Boolean(c.has_pin),
      createdAt: Number(c.created_at),
      lastActiveAt: n(c.last_active_at),
      pagesColored: Number(c.pages_colored),
      pagesFinished: Number(c.pages_finished),
      coloringMs: Number(c.coloring_ms),
    })),
    activity: events.rows.map((e) => ({
      type: e.type as string,
      profileId: (e.profile_id as string | null) ?? null,
      bookId: (e.book_id as string | null) ?? null,
      pageId: (e.page_id as string | null) ?? null,
      at: Number(e.at),
      ms: e.data && typeof e.data === 'object' ? Number((e.data as Record<string, unknown>).ms ?? 0) || null : null,
    })),
    books: books.rows.map((b) => ({ bookId: b.book_id as string, pagesColored: Number(b.pages_colored), pagesFinished: Number(b.pages_finished), lastAt: Number(b.last_at) })),
  }
}

async function target(id: string) {
  const { rows } = await query<{ name: string; email: string; role: string; suspended_at: Date | null }>(
    `select u.name, u.email, f.role, u."suspendedAt" as suspended_at from "user" u join app_family f on f.user_id = u.id where u.id = $1`,
    [id],
  )
  if (!rows[0] || rows[0].role === 'owner') throw new UserError(404, 'That account doesn’t exist.')
  return rows[0]
}

/** Suspends an account: it's signed out everywhere and can't sign in until reactivated. Its data stays. */
export async function suspendUser(actor: Actor, id: string, reason: unknown) {
  const t = await target(id)
  if (t.suspended_at) throw new UserError(400, 'This account is already suspended.')
  const why = typeof reason === 'string' ? reason.trim().slice(0, 300) || null : null
  await query('update "user" set "suspendedAt" = now() where id = $1', [id])
  await query('update app_family set suspended_reason = $2 where user_id = $1', [id, why])
  const signedOut = await query('delete from session where "userId" = $1', [id])
  await audit({
    actorId: actor.id,
    actorLabel: actor.label,
    action: 'user.suspended',
    targetType: 'user',
    targetId: id,
    summary: `Suspended ${t.name || t.email}${why ? `: ${why}` : ''}`,
    after: { email: t.email, reason: why, devicesSignedOut: signedOut.rowCount ?? 0 },
  })
  return getUser(id)
}

export async function reactivateUser(actor: Actor, id: string) {
  const t = await target(id)
  if (!t.suspended_at) throw new UserError(400, 'This account isn’t suspended.')
  await query('update "user" set "suspendedAt" = null where id = $1', [id])
  await query('update app_family set suspended_reason = null where user_id = $1', [id])
  await audit({ actorId: actor.id, actorLabel: actor.label, action: 'user.reactivated', targetType: 'user', targetId: id, summary: `Reactivated ${t.name || t.email}`, after: { email: t.email } })
  return getUser(id)
}

/** Emails the family a password reset link (or prints it in the server log without an email key). */
export async function sendPasswordReset(actor: Actor, id: string) {
  const t = await target(id)
  if (t.suspended_at) throw new UserError(400, 'Reactivate the account first; suspended accounts can’t sign in.')
  await getAuth().api.requestPasswordReset({ body: { email: t.email, redirectTo: `${env.APP_URL}/reset-password` } })
  await audit({ actorId: actor.id, actorLabel: actor.label, action: 'user.password_reset_sent', targetType: 'user', targetId: id, summary: `Sent a password reset email to ${t.email}` })
  return { ok: true as const }
}

/** Deletes the account and everything in it (children, colorings, activity). Needs the email typed to confirm. */
export async function deleteUser(actor: Actor, id: string, confirmEmail: unknown) {
  const t = await target(id)
  if (typeof confirmEmail !== 'string' || confirmEmail.trim().toLowerCase() !== t.email.toLowerCase()) throw new UserError(400, 'Type the account’s email exactly to confirm.')
  const counts = await query<{ children: number; artworks: number }>(
    `select (select count(*)::int from app_profile where user_id = $1 and not deleted) as children,
            (select count(*)::int from app_artwork where user_id = $1 and not deleted) as artworks`,
    [id],
  )
  // Every app table references "user" with on delete cascade; Better Auth's tables do too.
  await query('delete from "user" where id = $1', [id])
  await audit({
    actorId: actor.id,
    actorLabel: actor.label,
    action: 'user.deleted',
    targetType: 'user',
    targetId: id,
    summary: `Deleted the account of ${t.name || t.email} and all its data`,
    before: { name: t.name, email: t.email, children: counts.rows[0].children, colorings: counts.rows[0].artworks },
  })
  return { ok: true as const }
}
