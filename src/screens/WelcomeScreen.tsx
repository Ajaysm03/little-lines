import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { GoogleButton, OrDivider, useAuthOptions } from '../components/GoogleButton'
import { ClayButton, ClayField, FormNote } from '../components/cozy'
import { useTitle } from '../lib/useTitle'
import { AuthError, useSession } from '../state/session-store'
import { AuthLayout } from './AuthLayout'

const linkClass = 'font-semibold text-ink underline decoration-honey decoration-[3px] underline-offset-4'

export function WelcomeScreen() {
  useTitle('Log in')
  const logIn = useSession((s) => s.logIn)
  const logInWithGoogle = useSession((s) => s.logInWithGoogle)
  const options = useAuthOptions()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(
    params.get('error') ? 'Google sign-in didn’t finish. Try again, or log in with your email.' : null,
  )
  const [busy, setBusy] = useState<'email' | 'google' | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email (or username) and password.')
      return
    }
    setBusy('email')
    try {
      await logIn(email, password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Couldn’t reach the server. Check your internet connection and try again.')
    } finally {
      setBusy(null)
    }
  }

  async function google() {
    setError(null)
    setBusy('google')
    try {
      await logInWithGoogle() // leaves the page for Google
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Couldn’t start Google sign-in. Try again.')
      setBusy(null)
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-[2.25rem] leading-[1.05] font-semibold sm:text-[2.75rem] text-ink-deep">Grab your crayons</h1>
      <p className="mt-3 max-w-[34ch] text-graphite">Log in as the grown-up, then pick who’s coloring today.</p>

      {options?.google ? (
        <div className="mt-8">
          <GoogleButton onClick={google} busy={busy === 'google'} />
          <OrDivider />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className={options?.google ? 'flex flex-col gap-5' : 'mt-8 flex flex-col gap-5'} noValidate>
        <ClayField
          label="Email or username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-col gap-2">
          <ClayField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Link to="/forgot-password" state={{ email: email.includes('@') ? email.trim() : '' }} className={`self-end text-[0.9375rem] ${linkClass}`}>
            Forgot password?
          </Link>
        </div>
        <FormNote>{error}</FormNote>
        <ClayButton type="submit" size="lg" busy={busy === 'email'} disabled={busy !== null} className="w-full mt-1">
          Log in
        </ClayButton>
      </form>

      <p className="mt-8 text-graphite">
        New here?{' '}
        <Link to="/signup" className={linkClass}>
          Create a family account
        </Link>
      </p>
    </AuthLayout>
  )
}
