import { betterAuth } from 'better-auth'
import { APIError } from 'better-auth/api'
import { username } from 'better-auth/plugins/username'
import { audit } from './audit.js'
import { getPool, query } from './db.js'
import { sendPasswordReset } from './emails.js'
import { env, googleEnabled } from './env.js'

/**
 * Sign-in for grown-ups: email and password, Google, and password reset by
 * email. The owner can also sign in with a username (set by npm run
 * owner:create). Users, sessions and reset tokens are stored in the Neon
 * database by Better Auth; children never sign in, they pick a profile.
 */
export const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/
function createAuth() {
  return betterAuth({
    appName: 'Little Lines',
    baseURL: env.APP_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET || undefined,
    database: getPool(),
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendPasswordReset(user.email, user.name, url)
      },
    },
    socialProviders: googleEnabled()
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
            prompt: 'select_account',
          },
        }
      : {},
    account: {
      // A Google sign-in with the same email as an existing email/password account joins them.
      accountLinking: { enabled: true, trustedProviders: ['google'] },
    },
    user: {
      // Set by the owner console (server/users.ts); never by the person themself.
      additionalFields: { suspendedAt: { type: 'date', required: false, input: false } },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    plugins: [
      username({
        displayUsername: false,
        minUsernameLength: 3,
        maxUsernameLength: 30,
        usernameValidator: (u) => USERNAME_PATTERN.test(u),
      }),
    ],
    databaseHooks: {
      session: {
        create: {
          // A suspended account can't sign in (with a password, Google or a reset link). Read through
          // Better Auth's adapter: sign-up runs in a transaction, and a separate query would wait on it.
          before: async (session, ctx) => {
            const user = (await ctx?.context.internalAdapter.findUserById(session.userId)) as { suspendedAt?: Date | null } | null
            if (user?.suspendedAt)
              throw new APIError('FORBIDDEN', { message: 'This account is suspended. Contact Little Lines for help.', code: 'ACCOUNT_SUSPENDED' })
          },
          // Every owner sign-in goes in the audit log, with where it came from.
          after: async (session) => {
            await query('update app_family set last_login_at = $2 where user_id = $1', [session.userId, Date.now()]).catch(() => {})
            const { rows } = await query<{ role: string; username: string | null; email: string }>(
              `select f.role, u.username, u.email from app_family f join "user" u on u.id = f.user_id where f.user_id = $1`,
              [session.userId],
            )
            if (rows[0]?.role !== 'owner') return
            await audit({
              actorId: session.userId,
              actorLabel: rows[0].username ?? rows[0].email,
              action: 'owner.signed_in',
              targetType: 'user',
              targetId: session.userId,
              summary: 'Owner signed in',
              context: { ip: session.ipAddress, browser: session.userAgent },
            }).catch((err) => console.error('[audit]', err))
          },
        },
      },
    },
  })
}

let instance: ReturnType<typeof createAuth> | null = null

export function getAuth() {
  instance ??= createAuth()
  return instance
}

/** For tests: rebuild with fresh settings. */
export function resetAuth() {
  instance = null
}
