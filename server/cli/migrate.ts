/** npm run db:migrate: create or update all tables in DATABASE_URL. */
import { getPool } from '../db.js'
import { migrate } from '../migrate.js'

migrate((m) => console.log(m))
  .then(() => console.log('Database ready.'))
  .catch((err) => {
    console.error('Migration failed:', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => getPool().end())
