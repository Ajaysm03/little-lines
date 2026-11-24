/**
 * Server settings, read from environment variables (`.env` locally, the Vercel
 * dashboard in production). See `.env.example` for what each one is.
 */
function read(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim()
}

export const env = {
  get DATABASE_URL() {
    return read('DATABASE_URL')
  },
  /** Public address of the app, e.g. https://little-lines.vercel.app (http://localhost:5173 locally). */
  get APP_URL() {
    return read('APP_URL', read('VERCEL_PROJECT_PRODUCTION_URL') ? `https://${read('VERCEL_PROJECT_PRODUCTION_URL')}` : 'http://localhost:5173')
  },
  get BETTER_AUTH_SECRET() {
    return read('BETTER_AUTH_SECRET')
  },
  get GOOGLE_CLIENT_ID() {
    return read('GOOGLE_CLIENT_ID')
  },
  get GOOGLE_CLIENT_SECRET() {
    return read('GOOGLE_CLIENT_SECRET')
  },
  get RESEND_API_KEY() {
    return read('RESEND_API_KEY')
  },
  /** Sender for password-reset emails, e.g. "Little Lines <hello@yourdomain.com>". */
  get EMAIL_FROM() {
    return read('EMAIL_FROM', 'Little Lines <onboarding@resend.dev>')
  },
}

export function googleEnabled(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
}
