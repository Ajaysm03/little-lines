import { Resend } from 'resend'
import { env } from './env.js'

/** The last reset email, for tests and for local development without Resend. */
export const outbox: Array<{ to: string; url: string }> = []

/** Sends the "reset your password" email, or prints the link when Resend isn't set up. */
export async function sendPasswordReset(to: string, name: string, url: string): Promise<void> {
  outbox.push({ to, url })
  if (outbox.length > 20) outbox.shift()
  if (!env.RESEND_API_KEY) {
    console.info(`\n[little-lines] Password reset link for ${to} (RESEND_API_KEY not set, so it was not emailed):\n${url}\n`)
    return
  }
  const resend = new Resend(env.RESEND_API_KEY)
  const greeting = name ? `Hi ${escapeHtml(name)},` : 'Hi,'
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to,
    subject: 'Reset your Little Lines password',
    text: `${name ? `Hi ${name},` : 'Hi,'}\n\nSomeone asked to reset the password for your Little Lines family account. Open this link to choose a new one. It works for one hour.\n\n${url}\n\nIf it wasn't you, you can ignore this email; your password stays the same.`,
    html: `<div style="font-family:system-ui,sans-serif;font-size:16px;line-height:1.5;color:#1b1e45;max-width:480px">
      <p>${greeting}</p>
      <p>Someone asked to reset the password for your Little Lines family account. Use the button to choose a new one. It works for one hour.</p>
      <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2b2f6b;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600">Choose a new password</a></p>
      <p style="color:#5b6180;font-size:14px">If it wasn't you, you can ignore this email; your password stays the same.</p>
    </div>`,
  })
  if (error) throw new Error(`Resend could not send the email: ${error.message}`)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
