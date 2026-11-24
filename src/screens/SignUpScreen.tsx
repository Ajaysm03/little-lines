import { ArrowLeft } from 'lucide-react'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { GoogleButton, OrDivider, useAuthOptions } from '../components/GoogleButton'
import { PinPad } from '../components/PinPad'
import { Button, FormError, TextField } from '../components/ui'
import { MIN_PASSWORD_LENGTH, UserFacingError } from '../data/accounts'
import { AuthError, useSession } from '../state/session-store'
import { AuthLayout } from './AuthLayout'
import { useTitle } from '../lib/useTitle'

type Fields = { name: string; email: string; password: string }
type FieldErrors = Partial<Record<keyof Fields, string>>

export function SignUpScreen() {
  const signUp = useSession((s) => s.signUp)
  const logInWithGoogle = useSession((s) => s.logInWithGoogle)
  const options = useAuthOptions()
  const [googleBusy, setGoogleBusy] = useState(false)
  useTitle('Create a family account')
  const navigate = useNavigate()
  const [step, setStep] = useState<'details' | 'pin'>('details')
  const [fields, setFields] = useState<Fields>({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)

  const set = (k: keyof Fields) => (e: ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }))

  function onDetails(e: FormEvent) {
    e.preventDefault()
    const next: FieldErrors = {}
    if (!fields.name.trim()) next.name = 'Enter your name.'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.trim())) next.email = 'Enter an email like name@example.com.'
    if (fields.password.length < MIN_PASSWORD_LENGTH)
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    setErrors(next)
    if (Object.keys(next).length === 0) setStep('pin')
  }

  async function onPin(parentPin: string) {
    setFormError(null)
    try {
      await signUp({ ...fields, parentPin })
      navigate('/profiles/new', { replace: true })
    } catch (err) {
      if (err instanceof AuthError && /email/i.test(err.message)) {
        setErrors({ email: err.message })
        setStep('details')
      } else if (err instanceof AuthError && /password/i.test(err.message)) {
        setErrors({ password: err.message })
        setStep('details')
      } else {
        setFormError(
          err instanceof AuthError || err instanceof UserFacingError
            ? err.message
            : 'Couldn’t reach the server. Check your internet connection and try again.',
        )
      }
    }
  }

  async function google() {
    setFormError(null)
    setGoogleBusy(true)
    try {
      await logInWithGoogle() // leaves for Google; a parent PIN is chosen after coming back
    } catch (err) {
      setFormError(err instanceof AuthError ? err.message : 'Couldn’t start Google sign-in. Try again.')
      setGoogleBusy(false)
    }
  }

  return (
    <AuthLayout>
      {step === 'details' ? (
        <>
          <h1 className="font-display text-display font-extrabold text-ink-deep">Make a family account</h1>
          <p className="mt-3 max-w-[36ch] text-graphite">
            One grown-up account holds everyone’s profiles, pages and progress.
          </p>
          {options?.google ? (
            <div className="mt-8">
              <GoogleButton onClick={google} busy={googleBusy} label="Sign up with Google" />
              <OrDivider />
            </div>
          ) : null}
          <form onSubmit={onDetails} className={options?.google ? 'flex flex-col gap-5' : 'mt-8 flex flex-col gap-5'} noValidate>
            <TextField label="Your name" autoComplete="name" value={fields.name} onChange={set('name')} error={errors.name} />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={fields.email}
              onChange={set('email')}
              error={errors.email}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              value={fields.password}
              onChange={set('password')}
              error={errors.password}
              hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            />
            <FormError>{formError}</FormError>
            <Button type="submit" size="lg" className="mt-1">
              Continue
            </Button>
          </form>
          <p className="mt-8 text-graphite">
            Already have an account?{' '}
            <Link to="/welcome" className="font-semibold text-ink underline decoration-sunflower decoration-[3px] underline-offset-4">
              Log in
            </Link>
          </p>
        </>
      ) : (
        <div className="flex flex-col items-start">
          <button
            type="button"
            onClick={() => setStep('details')}
            className="-ml-2 mb-6 inline-flex min-h-11 items-center gap-1.5 rounded-full px-2 font-semibold text-ink hover:bg-frost"
          >
            <ArrowLeft className="size-5" /> Back
          </button>
          <div className="w-full rounded-[28px] bg-paper px-6 py-8 shadow-paper">
            <PinPad
              mode="create"
              title="Choose a parent PIN"
              subtitle="4 numbers that keep the grown-ups area just for grown-ups."
              onSubmit={onPin}
            />
          </div>
          <div className="mt-4 w-full">
            <FormError>{formError}</FormError>
          </div>
        </div>
      )}
    </AuthLayout>
  )
}
