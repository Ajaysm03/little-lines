import type { Book } from '../content/books'
import type { FamilyPlan, PlanName } from './api'

export const PLAN_NAMES: Record<PlanName, string> = { free: 'Free', trial: 'Trial', premium: 'Premium' }

/**
 * What a family gets right now. Worked out on the device too (not only from
 * the server's last answer), so a trial that ends while offline still ends.
 */
export function currentPlan(plan: FamilyPlan | null | undefined, now = Date.now()): PlanName {
  if (!plan || plan.plan === 'free') return 'free'
  return plan.endsAt !== null && plan.endsAt <= now ? 'free' : plan.plan
}

/** Premium books are locked for families on Free. Families without plan data yet (older app data) aren't locked out. */
export function isBookLocked(book: Pick<Book, 'tier'>, plan: FamilyPlan | null | undefined, now = Date.now()): boolean {
  if (book.tier !== 'premium' || plan === undefined) return false
  return currentPlan(plan, now) === 'free'
}

/** Whole days left until `t`, at least 1 while it's still ahead. */
export function daysLeft(t: number, now = Date.now()): number {
  return Math.max(1, Math.ceil((t - now) / 86_400_000))
}
