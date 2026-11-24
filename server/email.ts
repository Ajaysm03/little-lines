import { Resend } from 'resend'
import { env } from './env.js'

/**
 * Sending email: through Resend when RESEND_API_KEY is set, otherwise printed
 * to the server log (local development, and production before email is set up).
 * Everything sent is also kept in `mailbox` (the last 50), which tests read.
 */
export interface Mail {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
}

export type Delivery = { status: 'sent' | 'logged' } | { status: 'failed'; error: string }

/** The last reset links, for tests and for local development without Resend. */
export const outbox: Array<{ to: string; url: string }> = []
export const mailbox: Mail[] = []

export function emailConfigured(): boolean {
  return Boolean(env.RESEND_API_KEY)
}

/** Sends up to any number of emails, 100 per request to Resend (its batch limit). One result per email. */
export async function deliver(mails: Mail[]): Promise<Delivery[]> {
  for (const m of mails) {
    mailbox.push(m)
    if (mailbox.length > 50) mailbox.shift()
  }
  if (!env.RESEND_API_KEY) {
    for (const m of mails) console.info(`[little-lines] Email to ${m.to} (RESEND_API_KEY not set, so it was not sent): ${m.subject}`)
    return mails.map(() => ({ status: 'logged' as const }))
  }
  const resend = new Resend(env.RESEND_API_KEY)
  const out: Delivery[] = []
  for (let i = 0; i < mails.length; i += 100) {
    const chunk = mails.slice(i, i + 100)
    try {
      const { error } =
        chunk.length === 1
          ? await resend.emails.send({ from: env.EMAIL_FROM, ...chunk[0] })
          : await resend.batch.send(chunk.map((m) => ({ from: env.EMAIL_FROM, ...m })))
      if (error) out.push(...chunk.map(() => ({ status: 'failed' as const, error: error.message })))
      else out.push(...chunk.map(() => ({ status: 'sent' as const })))
    } catch (err) {
      out.push(...chunk.map(() => ({ status: 'failed' as const, error: err instanceof Error ? err.message : String(err) })))
    }
  }
  return out
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
