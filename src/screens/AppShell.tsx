import { Outlet, useLocation } from 'react-router'
import { TAB_BAR_SPACE, TabBar } from '../components/cozy/TabBar'
import { crayonHex } from '../content/profile-options'
import { useActiveProfile } from '../state/hooks'

/** Screens that draw the clay tab bar themselves (in their scene, or fixed on phones), or have none (stickers). */
const OWN_TAB_BAR = /^\/(home|library|gallery|stickers|books\/[^/]+)$/

/** Kids' screens. Scene screens place their own tab bar; the rest get it fixed to the bottom. */
export function AppShell() {
  const profile = useActiveProfile()
  const { pathname } = useLocation()
  const crayon = profile ? crayonHex(profile.color) : 'var(--color-ink)'
  const own = OWN_TAB_BAR.test(pathname.replace(/\/+$/, ''))

  return (
    <div className="min-h-dvh" style={{ ['--crayon' as string]: crayon }}>
      <a
        href="#content"
        className="sr-only z-50 rounded-full bg-ink px-5 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <div id="content" tabIndex={-1} className={own ? 'outline-none' : `flex min-h-dvh flex-col outline-none ${TAB_BAR_SPACE}`}>
        <Outlet />
      </div>
      {own ? null : <TabBar variant="fixed" />}
    </div>
  )
}
