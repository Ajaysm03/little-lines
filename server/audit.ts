import { query } from './db.js'

/**
 * The owner's audit log: every action taken from the owner console or the
 * owner:create command, plus owner sign-ins. Entries are never edited or
 * deleted by the app.
 */
export interface AuditInput {
  /** The user who acted; null for the terminal and for automatic changes. */
  actorId: string | null
  /** Shown in the log: a username, "Terminal" or "System". */
  actorLabel: string
  /** Dotted name, e.g. "owner.created", "book.published". */
  action: string
  targetType?: string
  targetId?: string
  /** One plain sentence describing what happened. */
  summary: string
  before?: unknown
  after?: unknown
  /** Where the action came from (IP and browser), when known. */
  context?: Record<string, string | null | undefined>
}

export interface AuditEntry {
  id: number
  actorId: string | null
  actorLabel: string
  action: string
  targetType: string | null
  targetId: string | null
  summary: string
  before: unknown
  after: unknown
  context: Record<string, string> | null
  at: number
}

export async function audit(e: AuditInput): Promise<void> {
  const context = e.context
    ? Object.fromEntries(Object.entries(e.context).filter((kv): kv is [string, string] => typeof kv[1] === 'string' && kv[1] !== ''))
    : null
  await query(
    `insert into app_audit (actor_id, actor_label, action, target_type, target_id, summary, before, after, context, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      e.actorId,
      e.actorLabel.slice(0, 120),
      e.action.slice(0, 64),
      e.targetType ?? null,
      e.targetId ?? null,
      e.summary.slice(0, 500),
      e.before === undefined ? null : JSON.stringify(e.before),
      e.after === undefined ? null : JSON.stringify(e.after),
      context && Object.keys(context).length ? JSON.stringify(context) : null,
      Date.now(),
    ],
  )
}

export interface AuditQuery {
  /** Return entries older than this id (for "Load more"). */
  before?: number
  /** Only actions starting with one of these comma-separated prefixes, e.g. "owner.created,role.". */
  action?: string
  limit?: number
}

export async function listAudit({ before, action, limit = 50 }: AuditQuery): Promise<{ entries: AuditEntry[]; nextBefore: number | null }> {
  const n = Math.max(1, Math.min(200, Math.floor(limit)))
  const params: unknown[] = []
  const where: string[] = []
  if (before && Number.isFinite(before)) {
    params.push(before)
    where.push(`id < $${params.length}`)
  }
  const prefixes = (action ?? '')
    .split(',')
    .map((a) => a.trim().slice(0, 64))
    .filter(Boolean)
    .slice(0, 10)
  if (prefixes.length) {
    // A plain prefix comparison: no LIKE, so "_" and "%" in action names mean themselves.
    const ors = prefixes.map((p) => {
      params.push(p)
      return `left(action, char_length($${params.length})) = $${params.length}`
    })
    where.push(`(${ors.join(' or ')})`)
  }
  params.push(n + 1)
  const { rows } = await query(
    `select * from app_audit ${where.length ? `where ${where.join(' and ')}` : ''} order by id desc limit $${params.length}`,
    params,
  )
  const entries = rows.slice(0, n).map((r) => ({
    id: Number(r.id),
    actorId: r.actor_id,
    actorLabel: r.actor_label,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    summary: r.summary,
    before: r.before,
    after: r.after,
    context: r.context,
    at: Number(r.at),
  }))
  return { entries, nextBefore: rows.length > n ? entries[entries.length - 1].id : null }
}
