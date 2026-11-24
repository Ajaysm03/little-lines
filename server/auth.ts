import { betterAuth } from 'better-auth'
import { getPool } from './db.js'
import { sendPasswordReset } from './email.js'
import { env, googleEnabled } from './env.js'

/**
 * Sign-in for grown-ups: email and password, Google, and password reset by
 * email. Users, sessions and reset tokens are stored in the Neon database by
 * Better Auth; children never sign in, they pick a profile under the account.
 */
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
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
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
