import pg from 'pg'
import { env } from './env.js'

/**
 * One connection pool per server instance. Neon needs TLS; the local PGlite
 * database (npm run db:local) does not, and accepts one connection at a time.
 */
let pool: pg.Pool | null = null

export function isLocalDatabase(url = env.DATABASE_URL): boolean {
  return /@(localhost|127\.0\.0\.1)(:|\/)/.test(url)
}

export function getPool(): pg.Pool {
  if (pool) return pool
  const url = env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.')
  const local = isLocalDatabase(url)
  pool = new pg.Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: true },
    max: local ? 1 : 5,
    idleTimeoutMillis: 10_000,
  })
  // An idle connection the database (or the network) drops emits 'error' on the pool. Without a
  // listener Node treats that as unhandled and the whole server exits; the pool just replaces it.
  pool.on('error', (err) => console.warn('Database connection dropped:', err.message))
  return pool
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  return getPool().query<T>(sql, params)
}

/** For tests: drop the pool so the next call connects to a new DATABASE_URL. */
export async function resetPool() {
  await pool?.end().catch(() => {})
  pool = null
}
