/**
 * npm run db:seed: creates the test family so you can log in straight away.
 * Values come from SEED_* in .env (see .env.example). Running it again leaves
 * an existing test account alone.
 */
import { hashSecret, PIN_ITERATIONS } from '../../src/lib/crypto.js'
import { getAuth } from '../auth.js'
import { getPool, query } from '../db.js'
import { migrate } from '../migrate.js'

const SEED = {
  name: process.env.SEED_NAME || 'Test Parent',
  email: (process.env.SEED_EMAIL || 'parent@example.test').toLowerCase(),
  password: process.env.SEED_PASSWORD || 'snowfall-test-2026',
  parentPin: process.env.SEED_PARENT_PIN || '2468',
  childPin: process.env.SEED_CHILD_PIN || '1357',
}

async function main() {
  await migrate()
  const existing = await query<{ id: string }>('select id from "user" where email = $1', [SEED.email])
  let userId = existing.rows[0]?.id
  if (userId) {
    console.log(`Test account ${SEED.email} already exists; leaving it as it is.`)
    return
  }
  const created = await getAuth().api.signUpEmail({ body: { name: SEED.name, email: SEED.email, password: SEED.password } })
  userId = created.user.id
  const now = Date.now()
  await query(
    `insert into app_family (user_id, parent_pin_hash, role, created_at)
     values ($1, $2, case when exists (select 1 from app_family) then 'parent' else 'admin' end, $3)
     on conflict (user_id) do update set parent_pin_hash = excluded.parent_pin_hash`,
    [userId, await hashSecret(SEED.parentPin, PIN_ITERATIONS), now],
  )
  const kids = [
    { name: 'Maya', avatar: 'bunny', color: 'cranberry', pin: null as string | null },
    { name: 'Leo', avatar: 'bear', color: 'meadow', pin: SEED.childPin },
  ]
  for (const [i, k] of kids.entries()) {
    await query(
      `insert into app_profile (id, user_id, name, avatar, color, pin_hash, created_at, last_active_at, updated_at, deleted, server_at)
       values (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6, null, $6, false, $6)`,
      [userId, k.name, k.avatar, k.color, k.pin ? await hashSecret(k.pin, PIN_ITERATIONS) : null, now + i],
    )
  }
  console.log(`Created test family ${SEED.email} with profiles Maya and Leo. The password and PINs are the SEED_* values (see README).`)
}

main()
  .catch((err) => {
    console.error('Seeding failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => getPool().end())
