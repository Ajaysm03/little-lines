import { BookOpen, ChartLine, LayoutDashboard, LogOut, Mail, ScrollText, Users, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { cn } from '../components/ui'
import { Wordmark } from '../components/Wordmark'
import { useSession } from '../state/session-store'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  /** The plan phase that builds this area; shown until it exists. */
  soon?: string
}

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users, soon: 'Phase D' },
  { to: '/admin/books', label: 'Books', icon: BookOpen, soon: 'Phase B' },
  { to: '/admin/analytics', label: 'Analytics', icon: ChartLine, soon: 'Phase E' },
  { to: '/admin/emails', label: 'Emails', icon: Mail, soon: 'Phase F' },
  { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
]

/**
 * The owner console: a dark sidebar on wide screens, a top bar with scrolling
 * tabs on phones and portrait iPads. Only the owner reaches it (RequireOwner).
 */
export function AdminLayout() {
  const account = useSession((s) => s.account)
  const logOut = useSession((s) => s.logOut)
  const navigate = useNavigate()
  const signOut = async () => {
    await logOut()
    navigate('/welcome', { replace: true })
  }

  return (
    <div className="min-h-dvh bg-snow lg:grid lg:grid-cols-[15.5rem_1fr]">
      <a
        href="#admin-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Wide screens: sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col bg-ink-deep px-4 py-6 text-white lg:flex">
        <div className="px-2">
          <Wordmark size="sm" tone="light" />
          <p className="mt-2 text-[0.875rem] text-white/60">Owner console</p>
        </div>
        <nav aria-label="Owner console" className="mt-8 flex flex-col gap-1">
          {ADMIN_NAV.map((item) => (
            <SideLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 px-2 pt-4">
          <p className="truncate font-semibold">{account?.username ?? account?.name}</p>
          <p className="truncate text-[0.875rem] text-white/60">{account?.email}</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-3 -ml-2 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-[0.9375rem] font-semibold text-white/85 hover:bg-white/10"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
      </aside>

      {/* Phones and portrait iPads: top bar and tabs */}
      <header className="sticky top-0 z-20 bg-ink-deep text-white lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
          <div className="flex items-baseline gap-3">
            <Wordmark size="sm" tone="light" />
            <span className="text-[0.875rem] text-white/60">Owner</span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-[0.9375rem] font-semibold text-white/85 hover:bg-white/10"
          >
            <LogOut className="size-4" /> Log out
          </button>
        </div>
        <nav aria-label="Owner console" className="flex gap-1 overflow-x-auto px-3 pb-2">
          {ADMIN_NAV.map((item) => (
            <TabLink key={item.to} item={item} />
          ))}
        </nav>
      </header>

      <main id="admin-main" className="min-w-0 px-4 pt-6 pb-16 sm:px-8 lg:px-10 lg:pt-10">
        <div className="mx-auto max-w-6xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}

function SideLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      className={({ isActive }) =>
        cn(
          'flex min-h-11 items-center gap-3 rounded-xl px-3 text-[0.9375rem] font-semibold transition-colors',
          isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:bg-white/6 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('size-[1.125rem] shrink-0', isActive && 'text-sunflower')} />
          <span className="flex-1">{item.label}</span>
          {item.soon ? <span className="text-[0.75rem] font-normal text-white/45">Soon</span> : null}
        </>
      )}
    </NavLink>
  )
}

function TabLink({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/admin'}
      className={({ isActive }) =>
        cn(
          'inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3.5 text-[0.9375rem] font-semibold',
          isActive ? 'bg-white text-ink-deep' : 'text-white/75 hover:bg-white/10',
        )
      }
    >
      <Icon className="size-4" /> {item.label}
    </NavLink>
  )
}

/** Page heading used by every console screen. */
export function AdminHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-title font-extrabold text-ink-deep">{title}</h1>
        {intro ? <p className="mt-1 max-w-prose text-graphite">{intro}</p> : null}
      </div>
      {actions}
    </div>
  )
}

/** A white panel with an optional heading, the console's basic building block. */
export function Panel({ title, aside, children, className }: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-3xl bg-paper p-5 ring-1 ring-mist sm:p-6', className)}>
      {title ? (
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h2 className="min-w-0 font-display text-[1.25rem] font-bold text-ink-deep">{title}</h2>
          {aside ? <div className="shrink-0 whitespace-nowrap">{aside}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}
