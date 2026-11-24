import { randomUUID } from 'node:crypto'
import { audit } from './audit.js'
import { getAuth, USERNAME_PATTERN } from './auth.js'
import { query } from './db.js'

export interface OwnerInput {
  username: string
  email: string
  name: string
  password: string
}

export const OWNER_MIN_PASSWORD = 12

/** Checks the owner's details; returns a problem to show, or null. */
export function ownerInputProblem(o: OwnerInput): string | null {
  if (!USERNAME_PATTERN.test(o.username)) return 'Username: 3 to 30 characters, lowercase letters, numbers, dots or underscores.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return 'Enter a valid email address.'
  if (!o.name.trim()) return 'Enter your name.'
  if (o.password.length < OWNER_MIN_PASSWORD) return `Use at least ${OWNER_MIN_PASSWORD} characters for the owner password.`
  if (o.password.length > 128) return 'Use 128 characters or fewer for the password.'
  return null
}

/**
 * Creates the owner account, or updates it (username, name, password) if the
 * email or username already belongs to an account. There is one owner: anyone
 * else marked as owner goes back to being a grown-up. Changing the password
 * signs the owner out everywhere. Every change goes in the audit log.
 */
export async function createOrUpdateOwner(input: OwnerInput, actorLabel = 'Terminal'): Promise<{ userId: string; created: boolean }> {
  const o = { ...input, username: input.username.trim().toLowerCase(), email: input.email.trim().toLowerCase(), name: input.name.trim() }
  const problem = ownerInputProblem(o)
  if (problem) throw new Error(problem)

  const auth = getAuth()
  const ctx = await auth.$context
  const existing = await query<{ id: string; email: string; username: string | null }>(
    `select id, email, username from "user" where email = $1 or username = $2`,
    [o.email, o.username],
  )
  if (existing.rows.length > 1)
    throw new Error('That email and that username belong to two different accounts. Use the email and username of the same account, or a new username.')

  let userId: string
  let created = false
  if (!existing.rows[0]) {
    const res = await auth.api.signUpEmail({ body: { name: o.name, email: o.email, password: o.password, username: o.username } })
    userId = res.user.id
    created = true
  } else {
    userId = existing.rows[0].id
    const hash = await ctx.password.hash(o.password)
    const credential = await query(`select id from account where "userId" = $1 and "providerId" = 'credential'`, [userId])
    if (credential.rowCount) await ctx.internalAdapter.updatePassword(userId, hash)
    else
      await query(
        `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1, $2, 'credential', $2, $3, now(), now())`,
        [randomUUID(), userId, hash],
      )
    await query(`update "user" set username = $2, email = $3, name = $4, "updatedAt" = now() where id = $1`, [userId, o.username, o.email, o.name])
    // A new password signs out every device that was signed in.
    await query(`delete from session where "userId" = $1`, [userId])
  }
  await query(`update "user" set "emailVerified" = true where id = $1`, [userId])

  const before = await query<{ role: string }>('select role from app_family where user_id = $1', [userId])
  await query(
    `insert into app_family (user_id, role, created_at) values ($1, 'owner', $2)
     on conflict (user_id) do update set role = 'owner'`,
    [userId, Date.now()],
  )
  const others = await query<{ user_id: string }>(`update app_family set role = 'parent' where role = 'owner' and user_id <> $1 returning user_id`, [userId])

  await audit({
    actorId: null,
    actorLabel,
    action: created ? 'owner.created' : 'owner.updated',
    targetType: 'user',
    targetId: userId,
    summary: created
      ? `Owner account created (username ${o.username})`
      : `Owner account updated: username ${o.username}, new password, signed out everywhere`,
    before: existing.rows[0] ? { username: existing.rows[0].username, email: existing.rows[0].email, role: before.rows[0]?.role ?? null } : undefined,
    after: { username: o.username, email: o.email, role: 'owner' },
  })
  for (const r of others.rows)
    await audit({
      actorId: null,
      actorLabel,
      action: 'role.changed',
      targetType: 'user',
      targetId: r.user_id,
      summary: 'No longer the owner: there is only one owner, so this account is a grown-up again',
      before: { role: 'owner' },
      after: { role: 'parent' },
    })
  return { userId, created }
}
