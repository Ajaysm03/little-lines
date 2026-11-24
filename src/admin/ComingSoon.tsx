import { useTitle } from '../lib/useTitle'
import { AdminHeader, Panel } from './AdminLayout'

/** What each console area will hold, from PLAN.md, until its phase is built. */
const AREAS = {
  users: {
    title: 'Users',
    phase: 'Phase D',
    items: [
      'Every family: name, email, joined, last login, last coloring, status (Active, Inactive after 30 days, Never started, Suspended)',
      'Search, filters, sorting and CSV export',
      'Change, extend or gift a plan; suspend or reactivate; send a password reset; delete an account',
    ],
  },
  books: {
    title: 'Books',
    phase: 'Phase B',
    items: [
      'Upload a PDF and turn it into a coloring book, page by page',
      'Edit details, cover and pages; draft, preview and publish',
      'Reorder the library, mark books Free or Premium, “New” badges',
      'Books families imported themselves arrive here as drafts',
    ],
  },
  analytics: {
    title: 'Analytics',
    phase: 'Phase E',
    items: [
      'Sign-ups and active families over time (daily, weekly, monthly)',
      'Per book: opens, pages colored, completion rate, most popular pages',
      'Plan mix and date-range filters',
    ],
  },
  emails: {
    title: 'Emails',
    phase: 'Phase F',
    items: [
      'Welcome email, weekly progress digest for grown-ups, new-book announcements',
      'Preview, send a test to yourself, history and counts',
      'Unsubscribe links and email settings for grown-ups',
    ],
  },
} as const

export function ComingSoon({ area }: { area: keyof typeof AREAS }) {
  const a = AREAS[area]
  useTitle(a.title)
  return (
    <>
      <AdminHeader title={a.title} intro={`This area is built in ${a.phase} of the owner console plan.`} />
      <Panel title="What it will do" className="mt-8 max-w-3xl">
        <ul className="flex list-disc flex-col gap-2 pl-5 text-ink-deep marker:text-graphite">
          {a.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Panel>
    </>
  )
}
