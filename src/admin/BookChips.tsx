import { cn } from '../components/ui'
import type { CatalogStatus, CatalogTier } from '../data/api'
import { STATUS_LABEL } from './books-data'

const STATUS_STYLE: Record<CatalogStatus, string> = {
  published: 'bg-meadow/14 text-meadow-ink',
  draft: 'bg-sky/12 text-ink',
  archived: 'bg-mist text-graphite',
}

/** Status, plan tier and "New", as small labels. Each carries its word, never color alone. */
export function StatusChip({ status, bundled }: { status: CatalogStatus; bundled?: boolean }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold', STATUS_STYLE[status])}>
      {bundled && status === 'draft' ? 'Hidden' : STATUS_LABEL[status]}
    </span>
  )
}

export function TierChip({ tier }: { tier: CatalogTier }) {
  return tier === 'premium' ? (
    <span className="inline-flex items-center rounded-full bg-sunflower/30 px-2.5 py-0.5 text-[0.8125rem] font-semibold text-ink-deep">Premium</span>
  ) : (
    <span className="inline-flex items-center rounded-full px-1 py-0.5 text-[0.8125rem] text-graphite">Free</span>
  )
}

export function NewChip() {
  return <span className="inline-flex items-center rounded-full bg-sunflower px-2.5 py-0.5 text-[0.8125rem] font-semibold text-ink-deep">New</span>
}
