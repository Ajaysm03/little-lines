import { audit } from './audit.js'
import { query } from './db.js'

/**
 * Plans, without payments (yet): every family is on Free, Trial or Premium,
 * with a start and an optional end date the owner sets. A Trial or Premium
 * plan whose end date has passed counts as Free; nothing has to run for that
 * to happen. New families start on a trial whose length is a setting.
 */
export const PLAN_SCHEMA = `
alter table app_family add column if not exists plan text;
alter table app_family add column if not exists plan_started_at bigint;
alter table app_family add column if not exists plan_ends_at bigint;
alter table app_family add column if not exists plan_note text;
alter table app_family add column if not exists plan_updated_at bigint;
create table if not exists app_setting (
  key text primary key,
  value jsonb not null,
  updated_at bigint not null
);
`

export type Plan = 'free' | 'trial' | 'premium'
const PLANS: Plan[] = ['free', 'trial', 'premium']
const DAY = 24 * 60 * 60 * 1000
export const DEFAULT_TRIAL_DAYS = 14

export interface FamilyPlan {
  plan: Plan
  /** What the family gets right now: Free once a Trial or Premium plan has ended. */
  effective: Plan
  startedAt: number | null
  endsAt: number | null
  note: string | null
  updatedAt: number | null
}

export function effectivePlan(plan: Plan, endsAt: number | null, now = Date.now()): Plan {
  if (plan === 'free') return 'free'
  return endsAt !== null && endsAt <= now ? 'free' : plan
}

export function rowToPlan(r: Record<string, unknown>, now = Date.now()): FamilyPlan {
  const plan = (PLANS.includes(r.plan as Plan) ? r.plan : 'free') as Plan
  const endsAt = r.plan_ends_at == null ? null : Number(r.plan_ends_at)
  return {
    plan,
    effective: effectivePlan(plan, endsAt, now),
    startedAt: r.plan_started_at == null ? null : Number(r.plan_started_at),
    endsAt,
    note: (r.plan_note as string | null) ?? null,
    updatedAt: r.plan_updated_at == null ? null : Number(r.plan_updated_at),
  }
}

export async function getTrialDays(): Promise<number> {
  const { rows } = await query<{ value: unknown }>(`select value from app_setting where key = 'trial_days'`)
  const n = Number(rows[0]?.value)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_TRIAL_DAYS
}

/** The plan columns for a brand-new family: a trial of the configured length (or Free if trials are off). */
export async function newFamilyPlan(now = Date.now()): Promise<{ plan: Plan; startedAt: number; endsAt: number | null }> {
  const days = await getTrialDays()
  return days > 0 ? { plan: 'trial', startedAt: now, endsAt: now + days * DAY } : { plan: 'free', startedAt: now, endsAt: null }
}

/**
 * Families from before plans existed start a trial now, so marking a book
 * Premium doesn't suddenly lock them out. Runs on every migrate; only touches
 * families with no plan yet.
 */
export async function giveExistingFamiliesTrial(log: (m: string) => void = () => {}) {
  const p = await newFamilyPlan()
  const { rows } = await query<{ user_id: string }>(
    `update app_family set plan = $1, plan_started_at = $2, plan_ends_at = $3, plan_updated_at = $2
     where plan is null and role <> 'owner' returning user_id`,
    [p.plan, p.startedAt, p.endsAt],
  )
  if (rows.length) {
    await audit({
      actorId: null,
      actorLabel: 'System',
      action: 'plan.started',
      targetType: 'plans',
      summary: `Plans switched on: ${rows.length} existing ${rows.length === 1 ? 'family starts' : 'families start'} ${p.plan === 'trial' ? `a ${Math.round((p.endsAt! - p.startedAt) / DAY)}-day trial` : 'on Free'}`,
      after: { plan: p.plan, families: rows.length },
    })
    log(`Started plans for ${rows.length} existing families (${p.plan})`)
  }
}

export class PlanError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface Actor {
  id: string
  label: string
}

const NAMES: Record<Plan, string> = { free: 'Free', trial: 'Trial', premium: 'Premium' }
const dateText = (t: number | null) => (t === null ? 'no end date' : new Date(t).toISOString().slice(0, 10))

/** The owner changes a family's plan. Free has no end date; Trial needs one; Premium may have one. */
export async function setFamilyPlan(actor: Actor, userId: string, body: { plan?: unknown; endsAt?: unknown; note?: unknown }): Promise<FamilyPlan> {
  const plan = body.plan as Plan
  if (!PLANS.includes(plan)) throw new PlanError(400, 'Choose Free, Trial or Premium.')
  let endsAt = body.endsAt == null || body.endsAt === '' ? null : Number(body.endsAt)
  if (endsAt !== null && !Number.isFinite(endsAt)) throw new PlanError(400, 'That end date isn’t valid.')
  if (plan === 'free') endsAt = null
  if (plan === 'trial' && endsAt === null) throw new PlanError(400, 'A trial needs an end date.')
  if (endsAt !== null && endsAt <= Date.now()) throw new PlanError(400, 'Choose an end date in the future.')
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null

  const { rows } = await query(
    `select f.*, u.name, u.email from app_family f join "user" u on u.id = f.user_id where f.user_id = $1 and f.role <> 'owner'`,
    [userId],
  )
  if (!rows[0]) throw new PlanError(404, 'That family doesn’t exist.')
  const before = rowToPlan(rows[0])
  const now = Date.now()
  const restart = before.plan !== plan
  await query(
    `update app_family set plan = $2, plan_started_at = $3, plan_ends_at = $4, plan_note = $5, plan_updated_at = $6 where user_id = $1`,
    [userId, plan, restart ? now : (before.startedAt ?? now), endsAt, note, now],
  )
  const after = rowToPlan((await query('select * from app_family where user_id = $1', [userId])).rows[0])
  const who = (rows[0].name as string) || (rows[0].email as string)
  await audit({
    actorId: actor.id,
    actorLabel: actor.label,
    action: 'plan.changed',
    targetType: 'user',
    targetId: userId,
    summary:
      before.plan === plan
        ? `${who}: ${NAMES[plan]} now ends ${dateText(endsAt)}`
        : `${who}: ${NAMES[before.effective]} → ${NAMES[plan]}${endsAt ? ` until ${dateText(endsAt)}` : ''}`,
    before: { plan: before.plan, endsAt: dateText(before.endsAt), note: before.note },
    after: { plan, endsAt: dateText(endsAt), note },
  })
  return after
}

/** Families and their plans, for the owner's Plans page. */
export async function ownerPlans() {
  const now = Date.now()
  const { rows } = await query(
    `select f.*, u.name, u.email from app_family f join "user" u on u.id = f.user_id where f.role <> 'owner' order by f.created_at desc`,
  )
  const families = rows.map((r) => ({ id: r.user_id as string, name: r.name as string, email: r.email as string, joinedAt: Number(r.created_at), ...rowToPlan(r, now) }))
  return { trialDays: await getTrialDays(), families }
}

export async function setTrialDays(actor: Actor, value: unknown): Promise<number> {
  const days = Number(value)
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new PlanError(400, 'Use a whole number of days from 0 to 365.')
  const before = await getTrialDays()
  await query(
    `insert into app_setting (key, value, updated_at) values ('trial_days', $1, $2)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [JSON.stringify(days), Date.now()],
  )
  if (before !== days)
    await audit({
      actorId: actor.id,
      actorLabel: actor.label,
      action: 'settings.trial_days',
      targetType: 'settings',
      summary: days === 0 ? 'Trials switched off: new families start on Free' : `New families now get a ${days}-day trial`,
      before: { trialDays: before },
      after: { trialDays: days },
    })
  return days
}
