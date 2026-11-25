import { useEffect, useState, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { PinPad } from '../components/PinPad'
import { Lock, LogOut } from 'lucide-react'
import { ClayButton, PaperCard, Tape } from '../components/cozy'
import { GrownupsFrame } from '../components/cozy/GrownupsFrame'
import { Spinner } from '../components/ui'
import { isParentUnlocked, useSession } from '../state/session-store'
import { useProfiles } from '../state/hooks'
import { useLibrary } from '../state/library-store'
import { useTitle } from '../lib/useTitle'

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
  const { status, profileId, account } = useSession()
  if (status !== 'signed-in') return <Navigate to="/welcome" replace />
  if (account?.role === 'owner') return <Navigate to="/admin" replace />
  if (account && !account.hasParentPin) return <Navigate to="/setup-pin" replace />
  return <Navigate to={profileId ? '/home' : '/profiles'} replace />
}

export function PublicOnly() {
  const status = useSession((s) => s.status)
  if (status === 'signed-in') return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireAccount() {
  const status = useSession((s) => s.status)
  const needsPin = useSession((s) => s.account !== null && !s.account.hasParentPin)
  const isOwner = useSession((s) => s.account?.role === 'owner')
  const location = useLocation()
  if (status !== 'signed-in') return <Navigate to="/welcome" replace state={{ from: location.pathname }} />
  // The owner has no children or PIN; the family screens aren't for them.
  if (isOwner) return <Navigate to="/admin" replace />
  // Google sign-ups choose their parent PIN before anything else.
  if (needsPin && location.pathname !== '/setup-pin') return <Navigate to="/setup-pin" replace />
  return <Outlet />
}

/** The owner console. Anyone else gets "page not found", so the console isn't advertised. */
export function RequireOwner({ notFound }: { notFound: ReactNode }) {
  const status = useSession((s) => s.status)
  const role = useSession((s) => s.account?.role)
  const location = useLocation()
  if (status !== 'signed-in') return <Navigate to="/welcome" replace state={{ from: location.pathname }} />
  if (role !== 'owner') return <>{notFound}</>
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
  const unlockedNow = useSession(isParentUnlocked)
  useTitle(unlockedNow ? undefined : 'Grown-ups only')
  const unlocked = useSession(isParentUnlocked)
  const unlockParent = useSession((s) => s.unlockParent)
  const logOut = useSession((s) => s.logOut)
  const profiles = useProfiles()
  const navigate = useNavigate()
  // Re-check the expiry every 30 s so an idle grown-ups screen closes itself.
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (unlocked) return <KeepUnlocked>{children}</KeepUnlocked>
  if (openWhenNoProfiles) {
    if (profiles === undefined) return <Splash />
    if (profiles.length === 0) return <>{children}</>
  }

  return (
    <GrownupsFrame back={{ label: 'Back to coloring', onClick: () => navigate(-1) }} width="max-w-[34rem]" center>
      <div className="relative mx-auto w-full max-w-[31rem]">
        <Tape variant="kraft" className="-top-3 left-1/2 -translate-x-1/2 -rotate-2" />
        <PaperCard className="flex flex-col items-center px-6 pt-10 pb-8 text-center sm:px-12">
          <span className="grid size-[5.75rem] place-items-center rounded-full bg-[var(--ll-navy)] text-white shadow-[inset_0_6px_3px_rgb(255_255_255/0.25),inset_0_-7px_7px_rgb(0_0_0/0.2),0_6px_0_var(--ll-navy-dk)]">
            <Lock className="size-10" strokeWidth={2.4} aria-hidden />
          </span>
          <div className="mt-4 w-full">
            <PinPad
              title="Grown-ups only"
              headingLevel={1}
              subtitle="Enter your parent PIN to continue."
              accent="var(--ll-navy)"
              onSubmit={(pin) => unlockParent(pin)}
            />
          </div>
          <p className="mt-8 text-[1.0625rem] leading-snug font-bold text-graphite">
            Forgot it? Sign out and use “Forgot password” to reset your account.
          </p>
          <ClayButton
            tone="cream"
            size="sm"
            className="mt-4 !text-rust"
            onClick={async () => {
              await logOut()
              navigate('/welcome', { replace: true })
            }}
          >
            <LogOut className="size-5" aria-hidden /> Sign out
          </ClayButton>
        </PaperCard>
      </div>
    </GrownupsFrame>
  )
}

/**
 * While a grown-up is using these screens, keep them unlocked: any tap or key pushes the 10-minute
 * lock back, so a form isn't thrown away mid-edit. It still locks after 10 quiet minutes.
 */
function KeepUnlocked({ children }: { children: ReactNode }) {
  const extend = useSession((s) => s.extendParent)
  useEffect(() => {
    let last = 0
    const onUse = () => {
      const now = Date.now()
      if (now - last < 20_000) return
      last = now
      extend()
    }
    window.addEventListener('pointerdown', onUse)
    window.addEventListener('keydown', onUse)
    return () => {
      window.removeEventListener('pointerdown', onUse)
      window.removeEventListener('keydown', onUse)
    }
  }, [extend])
  return <>{children}</>
}
