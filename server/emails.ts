import { createHmac, timingSafeEqual } from 'node:crypto'
import { audit } from './audit.js'
import { query } from './db.js'
import { deliver, emailConfigured, escapeHtml as esc, outbox, type Mail } from './email.js'
import { env } from './env.js'
import { effectivePlan, type Plan } from './plans.js'

/**
 * Family emails: a welcome on sign-up, a weekly progress summary (Mondays, by
 * Vercel Cron), and "new book" announcements the owner sends. Every one is
 * logged, and the weekly and announcement emails carry a signed unsubscribe
 * link (and the one-click header mail apps use). Password resets and the
 * welcome always go out; they aren't newsletters.
 */
export const EMAIL_SCHEMA = `
alter table app_family add column if not exists email_weekly boolean not null default true;
alter table app_family add column if not exists email_news boolean not null default true;
create table if not exists app_email_log (
  id bigserial primary key,
  user_id text references "user"(id) on delete cascade,
  kind text not null,
  ref text,
  to_email text not null,
  subject text not null,
  status text not null,
  error text,
  at bigint not null
);
create index if not exists app_email_log_at on app_email_log (at desc);
create index if not exists app_email_log_kind on app_email_log (kind, ref, user_id);
`

export type EmailKind = 'welcome' | 'weekly' | 'new_book' | 'password_reset' | 'test'
/** What an unsubscribe link turns off. */
export type Topic = 'weekly' | 'news'

const DAY = 86_400_000
const BRAND = { ink: '#1b1e45', mid: '#2b2f6b', muted: '#5b6180', snow: '#f3f5fa', mist: '#dce1ec', sun: '#f2c230' }
const dateLong = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

// ── Unsubscribe links ───────────────────────────────────────────────────────

export function unsubscribeToken(userId: string, topic: Topic): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET || 'little-lines-dev').update(`unsubscribe:${userId}:${topic}`).digest('base64url').slice(0, 32)
}

export function unsubscribeUrl(userId: string, topic: Topic): string {
  const q = new URLSearchParams({ u: userId, k: topic, t: unsubscribeToken(userId, topic) })
  return `${env.APP_URL}/api/email/unsubscribe?${q}`
}

function validToken(userId: string, topic: string, token: string): topic is Topic {
  if (topic !== 'weekly' && topic !== 'news') return false
  const a = Buffer.from(unsubscribeToken(userId, topic))
  const b = Buffer.from(token)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The page an unsubscribe link opens (GET), and the result of confirming it (POST, also used by mail apps' one-click). */
export async function unsubscribe(method: string, params: URLSearchParams, oneClick: boolean): Promise<{ status: number; html: string }> {
  const u = params.get('u') ?? ''
  const k = params.get('k') ?? ''
  const t = params.get('t') ?? ''
  if (!validToken(u, k, t)) return { status: 400, html: page('This link doesn’t work', '<p>The unsubscribe link is incomplete or was changed. Open the newest email and try its link, or change your emails in Little Lines under Grown-ups.</p>') }
  const what = k === 'weekly' ? 'weekly progress emails' : 'new book emails'
  const { rows } = await query<{ email: string }>(`select u.email from "user" u where u.id = $1`, [u])
  if (!rows[0]) return { status: 404, html: page('Account not found', '<p>This Little Lines account no longer exists, so it won’t get any more emails.</p>') }
  if (method === 'POST') {
    await query(`update app_family set ${k === 'weekly' ? 'email_weekly' : 'email_news'} = false where user_id = $1`, [u])
    if (oneClick) return { status: 200, html: 'Unsubscribed' }
    return { status: 200, html: page('You’re unsubscribed', `<p>${esc(rows[0].email)} won’t get ${what} any more. You can turn them back on in Little Lines, under Grown-ups → Emails.</p>`) }
  }
  // A link opened from an email only asks; some mail filters open links, and that shouldn't unsubscribe anyone.
  return {
    status: 200,
    html: page(
      `Stop ${what}?`,
      `<p>${esc(rows[0].email)} will stop getting ${what} from Little Lines. Other emails, like password resets, still arrive.</p>
       <form method="post"><button type="submit" style="font:inherit;font-weight:600;background:${BRAND.mid};color:#fff;border:0;border-radius:999px;padding:12px 22px;cursor:pointer">Unsubscribe</button></form>`,
    ),
  }
}

function page(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} – Little Lines</title></head>
  <body style="margin:0;background:${BRAND.snow};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${BRAND.ink};font-size:17px;line-height:1.55">
  <main style="max-width:480px;margin:12vh auto;padding:28px;background:#fff;border-radius:24px;box-shadow:0 0 0 1px ${BRAND.mist}">
  <p style="margin:0 0 18px;font-weight:800;font-size:20px;color:${BRAND.mid}">Little Lines</p><h1 style="font-size:24px;line-height:1.25;margin:0 0 12px">${esc(title)}</h1>${body}</main></body></html>`
}

// ── Templates ───────────────────────────────────────────────────────────────

interface Layout {
  preheader: string
  heading: string
  body: string
  cta?: { label: string; url: string }
  /** Why they got it, and how to stop it. */
  footer: string
}

/** One table-based layout that holds up in Gmail, Apple Mail and Outlook. */
function layout(l: Layout): string {
  const button = l.cta
    ? `<tr><td style="padding:8px 32px 28px"><a href="${esc(l.cta.url)}" style="display:inline-block;background:${BRAND.mid};color:#ffffff;padding:13px 24px;border-radius:999px;text-decoration:none;font-weight:700">${esc(l.cta.label)}</a></td></tr>`
    : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:${BRAND.snow}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.snow}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${BRAND.ink};font-size:16px;line-height:1.55">
<tr><td style="padding:28px 32px 0"><span style="font-size:22px;font-weight:800;color:${BRAND.mid}">Little Lines</span><div style="width:112px;height:5px;border-radius:3px;background:${BRAND.sun};margin-top:4px"></div></td></tr>
<tr><td style="padding:22px 32px 4px"><h1 style="margin:0;font-size:24px;line-height:1.25;color:${BRAND.ink}">${esc(l.heading)}</h1></td></tr>
<tr><td style="padding:8px 32px 12px">${l.body}</td></tr>
${button}
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 32px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:${BRAND.muted}">${l.footer}</td></tr></table>
</td></tr></table></body></html>`
}

const p = (html: string) => `<p style="margin:0 0 14px">${html}</p>`

/** Plain-text version: the layout's words without the markup. */
function textOf(l: Layout, extra = ''): string {
  const strip = (h: string) =>
    h
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<\/(p|tr|h\d|li)>/g, '\n')
      .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g, '$2 ($1)')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  return [l.heading, '', strip(l.body), l.cta ? `\n${l.cta.label}: ${l.cta.url}` : '', extra, '', '—', strip(l.footer)].join('\n')
}

function build(to: string, subject: string, l: Layout, unsubscribe?: string): Mail {
  return {
    to,
    subject,
    html: layout(l),
    text: textOf(l),
    headers: unsubscribe ? { 'List-Unsubscribe': `<${unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined,
  }
}

export function welcomeEmail(f: { email: string; name: string; plan: Plan; planEndsAt: number | null }): Mail {
  const first = f.name.split(' ')[0] || 'there'
  const trial =
    f.plan === 'trial' && f.planEndsAt
      ? p(`Your family is on a free trial until <strong>${dateLong(f.planEndsAt)}</strong>: every book is unlocked, Premium ones too.`)
      : ''
  return build(f.email, 'Welcome to Little Lines', {
    preheader: 'Three steps to your first colored page.',
    heading: `Welcome, ${first}!`,
    body:
      p('Little Lines is a quiet coloring book for your children, on a tablet or computer. Here’s how to start:') +
      `<ol style="margin:0 0 14px;padding-left:22px"><li style="margin-bottom:6px">Add a profile for each child (in Grown-ups). Their coloring is kept separately.</li><li style="margin-bottom:6px">Pick a book and flip to a page they like.</li><li>Color with a finger or an Apple Pencil. Everything saves by itself, even offline.</li></ol>` +
      trial +
      p('Your parent PIN keeps the grown-ups area to you.'),
    cta: { label: 'Open Little Lines', url: env.APP_URL },
    footer: `You’re getting this because a Little Lines family account was made with ${esc(f.email)}. If that wasn’t you, reply and let us know.`,
  })
}

export interface WeekChild {
  name: string
  minutes: number
  pagesColored: number
  pagesFinished: number
}

export function weeklyEmail(f: { userId: string; email: string; name: string; children: WeekChild[]; newBooks: string[]; trialEndsAt: number | null }, weekOf: number): Mail {
  const active = f.children.filter((c) => c.minutes > 0 || c.pagesColored > 0)
  const names = active.map((c) => c.name)
  const subject =
    names.length === 0
      ? 'Your week in Little Lines'
      : names.length === 1
        ? `${names[0]}’s week in Little Lines`
        : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}’s week in Little Lines`
  const rows = f.children
    .map(
      (c) =>
        `<tr><td style="padding:10px 0;border-top:1px solid ${BRAND.mist};font-weight:700">${esc(c.name)}</td><td style="padding:10px 0;border-top:1px solid ${BRAND.mist};text-align:right;color:${BRAND.muted}">${
          c.minutes || c.pagesColored
            ? `${c.minutes} min, ${c.pagesColored} ${c.pagesColored === 1 ? 'page' : 'pages'}${c.pagesFinished ? `, ${c.pagesFinished} finished` : ''}`
            : 'No coloring this week'
        }</td></tr>`,
    )
    .join('')
  const books = f.newBooks.length
    ? p(`<strong>New this week:</strong> ${f.newBooks.map(esc).join(', ')}.`)
    : ''
  const trial = f.trialEndsAt ? p(`Your free trial ends on <strong>${dateLong(f.trialEndsAt)}</strong>. After that, Premium books are locked.`) : ''
  const unsub = unsubscribeUrl(f.userId, 'weekly')
  return build(
    f.email,
    subject,
    {
      preheader: active.length ? `${active.reduce((t, c) => t + c.minutes, 0)} minutes of coloring this week.` : 'A quiet week. New pages are waiting.',
      heading: `Week of ${dateLong(weekOf)}`,
      body:
        p(active.length ? 'Here’s what your family colored in the last seven days.' : 'No one colored this week. Here’s what’s waiting for you.') +
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px;font-size:15px">${rows}</table>` +
        books +
        trial,
      cta: { label: 'Keep coloring', url: env.APP_URL },
      footer: `A weekly summary for ${esc(f.email)}, sent on Mondays. <a href="${esc(unsub)}" style="color:${BRAND.muted}">Stop weekly emails</a>, or change them in Grown-ups → Emails.`,
    },
    unsub,
  )
}

export function newBookEmail(f: { userId: string; email: string; locked: boolean }, b: { id: string; title: string; subtitle: string; description: string; pages: number; premium: boolean }): Mail {
  const unsub = unsubscribeUrl(f.userId, 'news')
  return build(
    f.email,
    `New in Little Lines: ${b.title}`,
    {
      preheader: b.subtitle || `${b.pages} new pages to color.`,
      heading: b.title,
      body:
        (b.subtitle ? p(`<strong>${esc(b.subtitle)}</strong>`) : '') +
        (b.description ? p(esc(b.description)) : '') +
        p(`${b.pages} ${b.pages === 1 ? 'page' : 'pages'} to color, in your library now.`) +
        (b.premium ? p(f.locked ? 'It’s a Premium book, so it’s locked on the Free plan.' : 'It’s a Premium book, and it’s unlocked for your family.') : ''),
      cta: { label: 'Open the book', url: `${env.APP_URL}/books/${b.id}` },
      footer: `We email ${esc(f.email)} when a new book arrives. <a href="${esc(unsub)}" style="color:${BRAND.muted}">Stop new book emails</a>, or change them in Grown-ups → Emails.`,
    },
    unsub,
  )
}

export function passwordResetEmail(to: string, name: string, url: string): Mail {
  return build(to, 'Reset your Little Lines password', {
    preheader: 'The link works for one hour.',
    heading: 'Choose a new password',
    body:
      p(name ? `Hi ${esc(name)},` : 'Hi,') +
      p('Someone asked to reset the password for your Little Lines family account. Use the button to choose a new one. It works for one hour.'),
    cta: { label: 'Choose a new password', url },
    footer: 'If it wasn’t you, you can ignore this email; your password stays the same.',
  })
}

// ── Sending, with the log ───────────────────────────────────────────────────

async function sendAndLog(items: Array<{ userId: string | null; kind: EmailKind; ref?: string; mail: Mail }>) {
  const results = await deliver(items.map((i) => i.mail))
  const now = Date.now()
  for (const [i, it] of items.entries()) {
    const r = results[i]
    await query(
      `insert into app_email_log (user_id, kind, ref, to_email, subject, status, error, at) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [it.userId, it.kind, it.ref ?? null, it.mail.to, it.mail.subject.slice(0, 200), r.status, r.status === 'failed' ? r.error.slice(0, 500) : null, now],
    )
  }
  return results
}

/** Better Auth calls this for "forgot password" and for resets the owner sends. */
export async function sendPasswordReset(to: string, name: string, url: string): Promise<void> {
  outbox.push({ to, url })
  if (outbox.length > 20) outbox.shift()
  if (!emailConfigured()) console.info(`\n[little-lines] Password reset link for ${to} (RESEND_API_KEY not set, so it was not emailed):\n${url}\n`)
  const user = await query<{ id: string }>('select id from "user" where email = $1', [to.toLowerCase()])
  const [r] = await sendAndLog([{ userId: user.rows[0]?.id ?? null, kind: 'password_reset', mail: passwordResetEmail(to, name, url) }])
  if (r.status === 'failed') throw new Error(`Resend could not send the email: ${r.error}`)
}

/** Sent once, when a family's account is first set up. Never throws: sign-up mustn't fail over an email. */
export async function sendWelcome(userId: string): Promise<void> {
  try {
    const { rows } = await query(`select u.email, u.name, f.plan, f.plan_ends_at, f.role from "user" u join app_family f on f.user_id = u.id where u.id = $1`, [userId])
    const f = rows[0]
    if (!f || f.role === 'owner') return
    const sent = await query(`select 1 from app_email_log where kind = 'welcome' and user_id = $1 limit 1`, [userId])
    if (sent.rowCount) return
    await sendAndLog([
      { userId, kind: 'welcome', mail: welcomeEmail({ email: f.email as string, name: f.name as string, plan: (f.plan as Plan) ?? 'free', planEndsAt: f.plan_ends_at == null ? null : Number(f.plan_ends_at) }) },
    ])
  } catch (err) {
    console.error('[email] welcome', err)
  }
}

/** Monday of the week containing `t` (UTC midnight): the key that keeps each weekly email to one per week. */
export function weekStart(t: number): number {
  const d = new Date(t)
  const day = (d.getUTCDay() + 6) % 7
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day)
}

/** What each family's weekly email would say; families with nothing to say are left out. */
export async function weeklyDigests(now = Date.now()) {
  const from = now - 7 * DAY
  const [families, children, minutes, artworks, newBooks] = await Promise.all([
    query(
      `select u.id, u.email, u.name, f.plan, f.plan_ends_at from "user" u join app_family f on f.user_id = u.id
       where f.role <> 'owner' and f.email_weekly and u."suspendedAt" is null`,
    ),
    query(`select id, user_id, name from app_profile where not deleted order by created_at`),
    query(
      `select profile_id, coalesce(sum((data->>'ms')::bigint), 0)::bigint as ms from app_event
       where type = 'coloring' and at >= $1 and at < $2 and profile_id is not null group by profile_id`,
      [from, now],
    ),
    query(
      `select profile_id, count(*) filter (where progress > 0)::int as colored, count(*) filter (where completed_at >= $1 and completed_at < $2)::int as finished
       from app_artwork where not deleted and updated_at >= $1 and updated_at < $2 group by profile_id`,
      [from, now],
    ),
    query(`select meta->>'title' as title from app_catalog_book where status = 'published' and origin <> 'bundled' and published_at >= $1 and published_at < $2 order by published_at`, [from, now]),
  ])
  const ms = new Map(minutes.rows.map((r) => [r.profile_id as string, Number(r.ms)]))
  const art = new Map(artworks.rows.map((r) => [r.profile_id as string, { colored: Number(r.colored), finished: Number(r.finished) }]))
  const titles = newBooks.rows.map((r) => r.title as string)
  return families.rows
    .map((f) => {
      const kids = children.rows
        .filter((c) => c.user_id === f.id)
        .map((c) => ({
          name: c.name as string,
          minutes: Math.round((ms.get(c.id as string) ?? 0) / 60000),
          pagesColored: art.get(c.id as string)?.colored ?? 0,
          pagesFinished: art.get(c.id as string)?.finished ?? 0,
        }))
      const endsAt = f.plan_ends_at == null ? null : Number(f.plan_ends_at)
      const trialEndsSoon = f.plan === 'trial' && effectivePlan('trial', endsAt, now) === 'trial' && endsAt! - now < 7 * DAY ? endsAt : null
      return { userId: f.id as string, email: f.email as string, name: f.name as string, children: kids, newBooks: titles, trialEndsAt: trialEndsSoon }
    })
    .filter((d) => d.children.length > 0 && (d.children.some((c) => c.minutes > 0 || c.pagesColored > 0) || d.newBooks.length > 0 || d.trialEndsAt))
}

/** Sends this week's summaries. Safe to run twice: a family gets at most one per week. */
export async function sendWeeklyDigests(now = Date.now()): Promise<{ sent: number; skipped: number; failed: number }> {
  const week = weekStart(now)
  const ref = new Date(week).toISOString().slice(0, 10)
  const digests = await weeklyDigests(now)
  const done = await query<{ user_id: string }>(`select user_id from app_email_log where kind = 'weekly' and ref = $1 and status <> 'failed'`, [ref])
  const already = new Set(done.rows.map((r) => r.user_id))
  const todo = digests.filter((d) => !already.has(d.userId))
  const results = await sendAndLog(todo.map((d) => ({ userId: d.userId, kind: 'weekly' as const, ref, mail: weeklyEmail(d, week) })))
  const failed = results.filter((r) => r.status === 'failed').length
  return { sent: results.length - failed, skipped: digests.length - todo.length, failed }
}

async function announcementTargets() {
  const { rows } = await query(
    `select u.id, u.email, f.plan, f.plan_ends_at from "user" u join app_family f on f.user_id = u.id
     where f.role <> 'owner' and f.email_news and u."suspendedAt" is null`,
  )
  return rows.map((r) => ({
    userId: r.id as string,
    email: r.email as string,
    locked: effectivePlan(((r.plan as Plan) ?? 'free'), r.plan_ends_at == null ? null : Number(r.plan_ends_at)) === 'free',
  }))
}

async function bookForEmail(bookId: string) {
  const { rows } = await query(`select id, status, tier, meta, origin from app_catalog_book where id = $1`, [bookId])
  const b = rows[0]
  if (!b || b.origin === 'bundled') throw new EmailError(404, 'That book doesn’t exist.')
  const pages = await query<{ n: number }>(`select count(*)::int as n from app_catalog_page where book_id = $1 and kind = 'line-art'`, [bookId])
  const m = b.meta as { title: string; subtitle: string; description: string }
  return { id: bookId, status: b.status as string, title: m.title, subtitle: m.subtitle ?? '', description: m.description ?? '', pages: pages.rows[0].n, premium: b.tier === 'premium' }
}

export class EmailError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** Whether a book was announced, and to how many families it would go now. */
export async function announcementStatus(bookId: string) {
  const sent = await query<{ at: string; n: number }>(`select max(at) as at, count(*)::int as n from app_email_log where kind = 'new_book' and ref = $1 and status <> 'failed'`, [bookId])
  return { announcedAt: sent.rows[0]?.at ? Number(sent.rows[0].at) : null, sentTo: sent.rows[0]?.n ?? 0, recipients: (await announcementTargets()).length }
}

/** The owner tells families about a published book. Once per book: families already told are skipped. */
export async function announceBook(actor: { id: string; label: string }, bookId: string) {
  const book = await bookForEmail(bookId)
  if (book.status !== 'published') throw new EmailError(400, 'Publish the book before announcing it.')
  const done = await query<{ user_id: string }>(`select user_id from app_email_log where kind = 'new_book' and ref = $1 and status <> 'failed'`, [bookId])
  const already = new Set(done.rows.map((r) => r.user_id))
  const todo = (await announcementTargets()).filter((t) => !already.has(t.userId))
  const results = await sendAndLog(todo.map((t) => ({ userId: t.userId, kind: 'new_book' as const, ref: bookId, mail: newBookEmail(t, book) })))
  const failed = results.filter((r) => r.status === 'failed').length
  await audit({
    actorId: actor.id,
    actorLabel: actor.label,
    action: 'email.announced',
    targetType: 'book',
    targetId: bookId,
    summary: `Announced “${book.title}” to ${results.length - failed} ${results.length - failed === 1 ? 'family' : 'families'}${failed ? ` (${failed} failed)` : ''}`,
    after: { sent: results.length - failed, failed, alreadyTold: already.size },
  })
  return { sent: results.length - failed, failed, skipped: already.size }
}

// ── Owner console ───────────────────────────────────────────────────────────

const SAMPLE_WEEK = [
  { name: 'Maya', minutes: 42, pagesColored: 3, pagesFinished: 2 },
  { name: 'Leo', minutes: 0, pagesColored: 0, pagesFinished: 0 },
]

/** A template filled with sample or real data, for the console's preview and test emails. */
export async function preview(kind: unknown, to: string, ownerId: string, bookId?: string | null): Promise<Mail> {
  const now = Date.now()
  if (kind === 'welcome') return welcomeEmail({ email: to, name: 'Sam Example', plan: 'trial', planEndsAt: now + 14 * DAY })
  if (kind === 'weekly') return weeklyEmail({ userId: ownerId, email: to, name: 'Sam Example', children: SAMPLE_WEEK, newBooks: ['Ocean Friends'], trialEndsAt: now + 3 * DAY }, weekStart(now))
  if (kind === 'new_book') {
    const book = bookId
      ? await bookForEmail(bookId)
      : { id: 'sample', title: 'Ocean Friends', subtitle: 'Whales, crabs and coral', description: 'Twelve calm pages under the sea.', pages: 12, premium: false }
    return newBookEmail({ userId: ownerId, email: to, locked: false }, book)
  }
  throw new EmailError(400, 'Choose welcome, weekly or new_book.')
}

export async function sendTest(actor: { id: string; label: string }, kind: unknown, bookId?: string | null) {
  const { rows } = await query<{ email: string }>('select email from "user" where id = $1', [actor.id])
  const mail = await preview(kind, rows[0].email, actor.id, bookId)
  const [r] = await sendAndLog([{ userId: actor.id, kind: 'test', ref: String(kind), mail: { ...mail, subject: `[Test] ${mail.subject}` } }])
  if (r.status === 'failed') throw new EmailError(502, `Resend didn’t send it: ${r.error}`)
  return { status: r.status, to: rows[0].email }
}

export async function emailOverview() {
  const since = Date.now() - 30 * DAY
  const [counts, log, subs] = await Promise.all([
    query<{ kind: string; status: string; n: number }>(`select kind, status, count(*)::int as n from app_email_log where at >= $1 group by kind, status`, [since]),
    query(`select id, user_id, kind, ref, to_email, subject, status, error, at from app_email_log order by id desc limit 100`),
    query<{ families: number; weekly: number; news: number }>(
      `select count(*)::int as families, count(*) filter (where f.email_weekly)::int as weekly, count(*) filter (where f.email_news)::int as news
       from app_family f join "user" u on u.id = f.user_id where f.role <> 'owner' and u."suspendedAt" is null`,
    ),
  ])
  return {
    configured: emailConfigured(),
    from: env.EMAIL_FROM,
    cronConfigured: Boolean(process.env.CRON_SECRET),
    counts: counts.rows,
    subscribers: subs.rows[0],
    log: log.rows.map((r) => ({
      id: Number(r.id),
      userId: r.user_id as string | null,
      kind: r.kind as EmailKind,
      ref: r.ref as string | null,
      to: r.to_email as string,
      subject: r.subject as string,
      status: r.status as 'sent' | 'logged' | 'failed',
      error: r.error as string | null,
      at: Number(r.at),
    })),
  }
}

export async function getPrefs(userId: string) {
  const { rows } = await query<{ email_weekly: boolean; email_news: boolean }>('select email_weekly, email_news from app_family where user_id = $1', [userId])
  return { weekly: rows[0]?.email_weekly ?? true, news: rows[0]?.email_news ?? true }
}

export async function setPrefs(userId: string, body: { weekly?: unknown; news?: unknown }) {
  if (typeof body.weekly === 'boolean') await query('update app_family set email_weekly = $2 where user_id = $1', [userId, body.weekly])
  if (typeof body.news === 'boolean') await query('update app_family set email_news = $2 where user_id = $1', [userId, body.news])
  return getPrefs(userId)
}
