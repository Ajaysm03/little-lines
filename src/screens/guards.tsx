import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { PinPad } from '../components/PinPad'
import { Button, Spinner } from '../components/ui'
import { isParentUnlocked, useSession } from '../state/session-store'
import { useProfiles } from '../state/hooks'
import { useLibrary } from '../state/library-store'

/** Restores the saved session once, then renders the app. */
export function Root() {
  const status = useSession((s) => s.status)
  const init = useSession((s) => s.init)
  const loadLibrary = useLibrary((s) => s.load)
  useEffect(() => {
    void init()
    void loadLibrary()
  }, [init, loadLibrary])
  if (status === 'loading') return <Splash />
  return <Outlet />
}

export function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center text-graphite" role="status">
      <span className="flex items-center gap-3">
        <Spinner className="size-5" /> Opening your books…
      </span>
    </div>
  )
}

export function IndexRedirect() {
  const { status, profileId } = useSession()
  if (status !== 'signed-in') return <Navigate to="/welcome" replace />
  return <Navigate to={profileId ? '/home' : '/profiles'} replace />
}

export function PublicOnly() {
  const status = useSession((s) => s.status)
  if (status === 'signed-in') return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireAccount() {
  const status = useSession((s) => s.status)
  const location = useLocation()
  if (status !== 'signed-in') return <Navigate to="/welcome" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RequireProfile() {
  const profileId = useSession((s) => s.profileId)
  if (!profileId) return <Navigate to="/profiles" replace />
  return <Outlet />
}

/**
 * Grown-ups only. Asks for the parent PIN unless it was entered in the last
 * few minutes. `openWhenNoProfiles` lets a brand-new family add its first child.
 */
export function ParentGate({ children, openWhenNoProfiles }: { children: ReactNode; openWhenNoProfiles?: boolean }) {
  const unlocked = useSession(isParentUnlocked)
  const unlockParent = useSession((s) => s.unlockParent)
  const profiles = useProfiles()
  const navigate = useNavigate()
  // Re-check the expiry every 30 s so an idle grown-ups screen closes itself.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (unlocked) return <>{children}</>
  if (openWhenNoProfiles) {
    if (profiles === undefined) return <Splash />
    if (profiles.length === 0) return <>{children}</>
  }

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="flex w-full max-w-sm flex-col items-center">
        <PinPad
          title="Grown-ups only"
          subtitle="Enter your parent PIN to continue."
          onSubmit={(pin) => unlockParent(pin)}
        />
        <Button variant="ghost" className="mt-6" onClick={() => navigate(-1)}>
          Go back
        </Button>
      </div>
    </div>
  )
}
