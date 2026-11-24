import { BookOpen, House, Images, Settings, type LucideIcon } from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router'
import { Avatar } from '../components/Avatar'
import { Wordmark } from '../components/Wordmark'
import { cn } from '../components/ui'
import { crayonHex } from '../content/profile-options'
import { useActiveProfile } from '../state/hooks'
import { useSession } from '../state/session-store'

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/gallery', label: 'My art', icon: Images },
]

/** Side rail on tablets and up, bottom tab bar on phones. */
export function AppShell() {
  const profile = useActiveProfile()
  const leaveProfile = useSession((s) => s.leaveProfile)
  const navigate = useNavigate()
  const crayon = profile ? crayonHex(profile.color) : 'var(--color-ink)'

  function switchProfile() {
    leaveProfile()
    navigate('/profiles')
  }

  const switchButton = profile ? (
    <button
      type="button"
      onClick={switchProfile}
      className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.8125rem] font-semibold text-graphite hover:bg-frost hover:text-ink"
      aria-label={`Switch profile (now ${profile.name})`}
    >
      <Avatar avatar={profile.avatar} color={profile.color} size="sm" />
      <span className="max-w-20 truncate">Switch</span>
    </button>
  ) : null

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[6.5rem_minmax(0,1fr)]" style={{ ['--crayon' as string]: crayon }}>
      <aside className="sticky top-0 hidden h-dvh flex-col items-center border-r-2 border-frost bg-paper py-6 md:flex">
        <NavLink to="/home" aria-label="Little Lines home" className="grid size-12 place-items-center rounded-2xl bg-ink">
          <img src="/favicon.svg" alt="" className="size-12 rounded-2xl" />
        </NavLink>
        <nav aria-label="Main" className="mt-8 flex flex-col gap-2">
          {NAV.map((item) => (
            <RailLink key={item.to} {...item} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-2">
          {switchButton}
          <NavLink
            to="/grown-ups"
            className="flex flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.8125rem] font-semibold text-graphite hover:bg-frost hover:text-ink"
          >
            <Settings className="size-6" />
            Grown-ups
          </NavLink>
        </div>
      </aside>

      <div className="flex min-h-dvh flex-col pb-24 md:pb-0">
        <header className="flex items-center justify-between px-4 pt-4 md:hidden">
          <Wordmark size="sm" />
          <NavLink to="/grown-ups" aria-label="Grown-ups" className="grid size-11 place-items-center rounded-full text-graphite hover:bg-frost">
            <Settings className="size-5" />
          </NavLink>
        </header>
        <Outlet />
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-40 flex items-stretch justify-around border-t-2 border-frost bg-paper/95 px-2 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden"
      >
        {NAV.map((item) => (
          <RailLink key={item.to} {...item} />
        ))}
        {switchButton}
      </nav>
    </div>
  )
}

function RailLink({ to, label, icon: Icon }: { to: string; label: string; icon: LucideIcon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group flex min-w-16 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[0.8125rem] font-semibold transition-colors',
          isActive ? 'text-ink' : 'text-graphite hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'grid h-9 w-14 place-items-center rounded-full transition-colors',
              isActive ? 'bg-[color-mix(in_srgb,var(--crayon)_22%,white)]' : 'group-hover:bg-frost',
            )}
          >
            <Icon className="size-6" strokeWidth={isActive ? 2.4 : 2} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}
