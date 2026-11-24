import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold select-none transition-[background-color,color,transform,box-shadow] duration-150 active:scale-[0.97] disabled:opacity-50 disabled:active:scale-100'
const variants: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-deep shadow-lift',
  secondary: 'bg-paper text-ink ring-2 ring-inset ring-mist hover:ring-ink/40',
  ghost: 'text-ink hover:bg-frost',
  danger: 'bg-paper text-error ring-2 ring-inset ring-error/30 hover:bg-error hover:text-white hover:ring-error',
}
const sizes: Record<Size, string> = {
  md: 'min-h-12 px-5 text-[1rem]',
  lg: 'min-h-14 px-7 text-[1.0625rem]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  busy?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', busy, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...rest} />
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  )
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  hint?: ReactNode
  error?: string | null
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const inputId = id ?? autoId
  // Password fields get an eye button to show what was typed.
  const isPassword = rest.type === 'password'
  const [shown, setShown] = useState(false)
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="font-semibold text-ink-deep">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'min-h-13 w-full rounded-2xl bg-paper px-4 text-[1.0625rem] text-ink-deep ring-2 ring-inset outline-none transition-shadow placeholder:text-graphite/60',
            'focus:ring-sky',
            error ? 'ring-error/60' : 'ring-mist',
            isPassword && 'pr-14',
          )}
          {...rest}
          type={isPassword && shown ? 'text' : rest.type}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            aria-pressed={shown}
            className="absolute top-1/2 right-1.5 grid size-11 -translate-y-1/2 place-items-center rounded-full text-graphite hover:bg-frost hover:text-ink"
          >
            {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="text-[0.9375rem] text-error">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-[0.9375rem] text-graphite">
          {hint}
        </p>
      ) : null}
    </div>
  )
})

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-2xl bg-error/8 px-4 py-3 text-[0.9375rem] text-error">
      {children}
    </p>
  )
}
