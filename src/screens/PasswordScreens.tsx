import { ArrowLeft, Check, MailCheck } from 'lucide-react'
import { useState, type FormEvent, useEffect, useRef, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { PinPad } from '../components/PinPad'
import { ClayButton, ClayField, ClayLink, FormNote } from '../components/cozy'
import { MIN_PASSWORD_LENGTH } from '../data/accounts'
import { authClient, authErrorMessage } from '../data/api'
import { useTitle } from '../lib/useTitle'
import { useSession } from '../state/session-store'
import { AuthLayout } from './AuthLayout'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function BackToLogin() {
  return (
    <Link to="/welcome" className="-ml-2 mb-6 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost">
      <ArrowLeft className="size-5" /> Back to log in
    </Link>
  )
}

/** Step 1: ask for the email; the server sends a link if an account has it. */
export function ForgotPasswordScreen() {
  useTitle('Forgot password')
  const location = useLocation()
  const [email, setEmail] = useState((location.state as { email?: string } | null)?.email ?? '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!EMAIL_RE.test(email.trim())) return setError('Enter an email like name@example.com.')
    setBusy(true)
    const { error: err } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (err) return setError(authErrorMessage(err))
    setSent(true)
  }

  return (
    <AuthLayout>
      <BackToLogin />
      {sent ? (
        <div>
          <span className="grid size-12 place-items-center rounded-full bg-frost text-ink">
            <MailCheck className="size-6" />
          </span>
          <FocusTitle className="mt-4 font-display text-title font-semibold text-ink-deep">Check your email</FocusTitle>
          <p className="mt-3 max-w-[38ch] text-graphite">
            If an account uses <span className="font-semibold text-ink-deep">{email.trim()}</span>, a link to choose a new
            password is on its way. It works for one hour. Check the spam folder if it doesn’t arrive in a few minutes.
          </p>
          <ClayButton tone="cream" className="mt-6" onClick={() => setSent(false)}>
            Use a different email
          </ClayButton>
        </div>
      ) : (
        <>
          <h1 className="font-display text-[2.25rem] leading-[1.05] font-semibold sm:text-[2.75rem] text-ink-deep">Forgot your password?</h1>
          <p className="mt-3 max-w-[36ch] text-graphite">
            Enter the email you use for Little Lines and we’ll send a link to choose a new password.
          </p>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
            <ClayField label="Email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <FormNote>{error}</FormNote>
            <ClayButton type="submit" size="lg" busy={busy} className="w-full">
              Send reset link
            </ClayButton>
          </form>
          <p className="mt-6 max-w-[38ch] text-[0.9375rem] text-graphite">
            Signed up with Google? There’s no password to reset. Use “Continue with Google” on the log-in page.
          </p>
        </>
      )}
    </AuthLayout>
  )
}

/** Step 2: the emailed link lands here with ?token=…; choose the new password. */
export function ResetPasswordScreen() {
  useTitle('Choose a new password')
  const [params] = useSearchParams()
  const token = params.get('token')
  const linkError = params.get('error')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string; form?: string }>({})
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: typeof errors = {}
    if (password.length < MIN_PASSWORD_LENGTH) next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    else if (confirm !== password) next.confirm = 'The two passwords don’t match.'
    setErrors(next)
    if (Object.keys(next).length || !token) return
    setBusy(true)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    setBusy(false)
    if (error) return setErrors({ form: authErrorMessage(error) })
    setDone(true)
  }

  if (!token || linkError) {
    return (
      <AuthLayout>
        <BackToLogin />
        <h1 className="font-display text-title font-semibold text-ink-deep">This link has expired</h1>
        <p className="mt-3 max-w-[38ch] text-graphite">
          Reset links work once, for one hour. Ask for a new one and use the newest email.
        </p>
        <ClayLink to="/forgot-password" size="lg" className="mt-6">
          Send a new link
        </ClayLink>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      {done ? (
        <div>
          <span className="grid size-12 place-items-center rounded-full bg-meadow-ink text-white">
            <Check className="size-6" strokeWidth={3} />
          </span>
          <FocusTitle className="mt-4 font-display text-title font-semibold text-ink-deep">Password changed</FocusTitle>
          <p className="mt-3 max-w-[36ch] text-graphite">
            You’re signed out everywhere else. Log in with your new password.
          </p>
          <ClayLink to="/welcome" size="lg" className="mt-6">
            Log in
          </ClayLink>
        </div>
      ) : (
        <>
          <h1 className="font-display text-[2.25rem] leading-[1.05] font-semibold sm:text-[2.75rem] text-ink-deep">Choose a new password</h1>
          <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
            <ClayField
              label="New password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            />
            <ClayField
              label="Type it again"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              error={errors.confirm}
            />
            <FormNote>{errors.form}</FormNote>
            <ClayButton type="submit" size="lg" busy={busy} className="w-full">
              Save new password
            </ClayButton>
          </form>
        </>
      )}
    </AuthLayout>
  )
}

/** After a Google sign-up there is no parent PIN yet; choose one before going further. */
export function SetupPinScreen() {
  useTitle('Choose a parent PIN')
  const account = useSession((s) => s.account)
  const setParentPin = useSession((s) => s.setParentPin)
  const logOut = useSession((s) => s.logOut)
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  return (
    <AuthLayout>
      <h1 className="font-display text-title font-semibold text-ink-deep">Welcome{account?.name ? `, ${account.name.split(' ')[0]}` : ''}!</h1>
      <p className="mt-2 max-w-[38ch] text-graphite">
        One last step: a 4-number parent PIN keeps the grown-ups area just for grown-ups.
      </p>
      <div className="mt-6 w-full rounded-[28px] bg-cream px-4 py-6 ring-2 ring-mist/70">
        <PinPad
          mode="create"
          title="Choose a parent PIN"
          onSubmit={async (pin) => {
            setError(null)
            try {
              await setParentPin(pin)
              navigate('/profiles', { replace: true })
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Couldn’t save the PIN. Try again.')
            }
          }}
        />
      </div>
      <div className="mt-4">
        <FormNote>{error}</FormNote>
      </div>
      <button
        type="button"
        onClick={async () => {
          await logOut()
          navigate('/welcome', { replace: true })
        }}
        className="mt-6 min-h-11 font-semibold text-ink underline underline-offset-4"
      >
        Use a different account
      </button>
    </AuthLayout>
  )
}

/** A heading for content that just replaced the form: it takes focus, so screen readers read it out. */
function FocusTitle({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => ref.current?.focus(), [])
  return (
    <h1 ref={ref} tabIndex={-1} className={`${className ?? ''} outline-none`}>
      {children}
    </h1>
  )
}
