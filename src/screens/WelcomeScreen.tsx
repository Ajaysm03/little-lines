import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button, FormError, TextField } from '../components/ui'
import { UserFacingError } from '../data/accounts'
import { useSession } from '../state/session-store'
import { AuthLayout } from './AuthLayout'

export function WelcomeScreen() {
  const logIn = useSession((s) => s.logIn)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await logIn(email, password)
      navigate('/profiles', { replace: true })
    } catch (err) {
      setError(err instanceof UserFacingError ? err.message : 'Something stopped the login. Try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout>
      <h1 className="font-display text-display font-extrabold text-ink-deep">Grab your crayons</h1>
      <p className="mt-3 max-w-[34ch] text-graphite">
        Log in as the grown-up, then pick who’s coloring today.
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-5" noValidate>
        <TextField
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <TextField
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" busy={busy} className="mt-1">
          Log in
        </Button>
      </form>

      <p className="mt-8 text-graphite">
        New here?{' '}
        <Link to="/signup" className="font-semibold text-ink underline decoration-sunflower decoration-[3px] underline-offset-4">
          Create a family account
        </Link>
      </p>
    </AuthLayout>
  )
}
