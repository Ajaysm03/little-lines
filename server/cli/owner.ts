/**
 * npm run owner:create: makes you the owner (super admin) of Little Lines, or
 * updates your owner login. Asks for everything here in the terminal; the
 * password is never shown, saved to a file, or written to the log.
 *
 * It works on whichever database DATABASE_URL in .env points to (Neon for the
 * live app, or the local one from npm run db:local).
 */
import { createInterface } from 'node:readline'
import { env } from '../env.js'
import { getPool } from '../db.js'
import { migrate } from '../migrate.js'
import { createOrUpdateOwner, OWNER_MIN_PASSWORD, ownerInputProblem } from '../owner.js'

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true })
    let muted = false
    // Hide what's typed for the password (readline has no built-in option for this).
    const out = rl as unknown as { _writeToOutput(s: string): void }
    out._writeToOutput = (s) => {
      if (!muted) process.stdout.write(s)
    }
    rl.question(question, (answer) => {
      rl.close()
      if (hidden) process.stdout.write('\n')
      resolve(answer)
    })
    muted = hidden
  })
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('Run this in a terminal: it asks for your password privately.')
  const where = /neon\.tech/.test(env.DATABASE_URL) ? 'the live Neon database' : /127\.0\.0\.1|localhost/.test(env.DATABASE_URL) ? 'the local database' : 'the database in DATABASE_URL'
  console.log(`\nLittle Lines owner account (saved in ${where})\n`)

  const username = (await ask('Username (lowercase, e.g. owner): ')).trim().toLowerCase()
  const email = (await ask('Email: ')).trim().toLowerCase()
  const name = (await ask('Your name: ')).trim()
  const password = await ask(`Password (at least ${OWNER_MIN_PASSWORD} characters, hidden): `, true)
  const problem = ownerInputProblem({ username, email, name, password })
  if (problem) throw new Error(problem)
  const again = await ask('Type the password again: ', true)
  if (again !== password) throw new Error('The two passwords are different. Run the command again.')

  await migrate()
  const { created } = await createOrUpdateOwner({ username, email, name, password })
  console.log(
    created
      ? `\nOwner account created. Log in with "${username}" or ${email} and your password; you'll go straight to the owner console.`
      : `\nOwner account updated. Any devices signed in to it were signed out; log in again with "${username}" or ${email}.`,
  )
}

main()
  .catch((err) => {
    console.error(`\nCouldn't save the owner account: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  })
  .finally(() => getPool().end())
