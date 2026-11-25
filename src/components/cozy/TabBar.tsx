import { BookOpen, House, Images, Settings, type LucideIcon } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { cn } from '../ui'
import { ScenePin } from './Scene'

const TABS: Array<{ to: string; label: string; icon: LucideIcon; tone: string; match: RegExp }> = [
  { to: '/home', label: 'Home', icon: House, tone: 'll-tone-honey', match: /^\/home/ },
  { to: '/library', label: 'Library', icon: BookOpen, tone: 'll-tone-cran', match: /^\/(library|books)/ },
  { to: '/gallery', label: 'My art', icon: Images, tone: 'll-tone-pine', match: /^\/(gallery|stickers)/ },
  { to: '/grown-ups', label: 'Grown-ups', icon: Settings, tone: 'll-tone-navy', match: /^\/grown-ups/ },
]

/**
 * The four clay tabs along the bottom of kids' screens.
 *
 * - `pins`: placed in a contained scene, peeking up from the bottom edge of the picture (1366×1024 design).
 * - `fixed`: pinned to the bottom of the window, for phones and screens without a scene.
 */
export function TabBar({ variant }: { variant: 'pins' | 'fixed' }) {
  const { pathname } = useLocation()
  if (variant === 'pins') {
    return (
      <nav aria-label="Main" className="pointer-events-none inset-0">
        {TABS.map((t, i) => {
          const current = t.match.test(pathname)
          return (
            <ScenePin key={t.to} x={271 + i * 212} y={current ? 912 : 932} w={206} h={124}>
              <TabLink tab={t} current={current} className="ll-tab-pin size-full" />
            </ScenePin>
          )
        })}
      </nav>
    )
  }
  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center gap-2 px-2 sm:gap-3"
    >
      {TABS.map((t) => {
        const current = t.match.test(pathname)
        return <TabLink key={t.to} tab={t} current={current} className={cn('ll-tab-fixed pointer-events-auto', current && 'll-tab-current')} />
      })}
    </nav>
  )
}

function TabLink({ tab, current, className }: { tab: (typeof TABS)[number]; current: boolean; className?: string }) {
  const Icon = tab.icon
  return (
    <Link to={tab.to} aria-current={current ? 'page' : undefined} className={cn('ll-clay', tab.tone, className)}>
      <Icon className="ll-tab-icon" strokeWidth={2.4} aria-hidden />
      {tab.label}
    </Link>
  )
}

/** Room to leave at the bottom of a scrolling screen so the fixed tab bar doesn't cover the end. */
export const TAB_BAR_SPACE = 'pb-[calc(6.5rem+env(safe-area-inset-bottom))] [@media(max-height:500px)]:pb-[calc(4.25rem+env(safe-area-inset-bottom))]'
