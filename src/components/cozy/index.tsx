/**
 * Cozy redesign building blocks: clay for things you press, paper for things you read.
 * Styles live in src/styles/cozy.css (ll-* classes). The accent tone follows the open book: wrap a
 * screen in `style={accentStyle(book.theme)}` (src/lib/accent.ts).
 */
import { Eye, EyeOff } from 'lucide-react'
import { forwardRef, useId, useState, type ButtonHTMLAttributes, type CSSProperties, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn, Spinner } from '../ui'

export type ClayTone = 'accent' | 'cran' | 'pine' | 'sky' | 'navy' | 'honey' | 'gold' | 'cream' | 'white'
export type ClaySize = 'sm' | 'md' | 'lg'

interface ClayLook {
  tone?: ClayTone
  size?: ClaySize
  /** Round icon button; `diameter` sets its size in px (default 64). */
  round?: boolean
  diameter?: number
}

function clayClass({ tone = 'accent', size = 'md', round }: ClayLook, className?: string) {
  return cn('ll-clay', tone !== 'accent' && `ll-tone-${tone}`, size !== 'md' && `ll-clay-${size}`, round && 'll-clay-round', className)
}

function clayStyle({ round, diameter }: ClayLook, style?: CSSProperties): CSSProperties | undefined {
  return round && diameter ? { ['--d' as string]: `${diameter}px`, ...style } : style
}

export interface ClayButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, ClayLook {
  busy?: boolean
}

/** A chunky clay button that sinks when pressed. Icon-only buttons need an aria-label. */
export const ClayButton = forwardRef<HTMLButtonElement, ClayButtonProps>(function ClayButton(
  { tone, size, round, diameter, busy, className, style, children, disabled, onClick, type = 'button', ...rest },
  ref,
) {
  const off = Boolean(disabled || busy)
  // Plain buttons stay focusable while disabled or busy (aria-disabled), so keyboard focus isn't
  // dropped when a button turns off under it. Submit buttons keep the native disabled state, which
  // also blocks submitting the form with Enter.
  const native = type === 'submit'
  return (
    <button
      ref={ref}
      type={type}
      disabled={native ? off : undefined}
      aria-disabled={off || undefined}
      aria-busy={busy || undefined}
      onClick={(e) => {
        if (off) {
          e.preventDefault()
          return
        }
        onClick?.(e)
      }}
      className={clayClass({ tone, size, round }, className)}
      style={clayStyle({ round, diameter }, style)}
      {...rest}
    >
      {busy ? <Spinner /> : null}
      {children}
    </button>
  )
})

/** The same clay look on a router link. */
export function ClayLink({ tone, size, round, diameter, className, style, ...rest }: LinkProps & ClayLook) {
  return <Link className={clayClass({ tone, size, round }, className)} style={clayStyle({ round, diameter }, style)} {...rest} />
}

/** Cream paper with a faint grain. `tilt` turns it a few degrees, as cards do when they sit in a scene. */
export function PaperCard({ flat, tilt, className, style, ...rest }: HTMLAttributes<HTMLDivElement> & { flat?: boolean; tilt?: number }) {
  return (
    <div
      className={cn('ll-paper', flat && 'll-paper-flat', className)}
      style={tilt ? { transform: `rotate(${tilt}deg)`, ...style } : style}
      {...rest}
    />
  )
}

export type TapeVariant = 'peach' | 'mint' | 'kraft' | 'cran' | 'rainbow'

/** A strip of washi tape; place it with className/style (it is absolutely positioned and decorative). */
export function Tape({ variant = 'peach', className, style }: { variant?: TapeVariant; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn('ll-tape', variant !== 'peach' && `ll-tape-${variant}`, className)} style={style} />
}

const CHIP_TONES: Record<string, CSSProperties> = {
  pine: { ['--c' as string]: 'var(--ll-pine)', ['--cd' as string]: 'var(--ll-pine-dk)', ['--t' as string]: '#fff' },
  sky: { ['--c' as string]: 'var(--ll-sky)', ['--cd' as string]: 'var(--ll-sky-dk)', ['--t' as string]: '#fff' },
  gold: { ['--c' as string]: 'var(--ll-gold)', ['--cd' as string]: 'var(--ll-gold-dk)', ['--t' as string]: 'var(--ll-ink)' },
  cran: { ['--c' as string]: 'var(--ll-cran)', ['--cd' as string]: 'var(--ll-cran-dk)', ['--t' as string]: '#fff' },
  accent: { ['--c' as string]: 'var(--acc)', ['--cd' as string]: 'var(--acc-dk)', ['--t' as string]: 'var(--on-acc)' },
}

/** A small clay label, like "Ages 3–8". */
export function Chip({ tone = 'pine', className, children }: { tone?: keyof typeof CHIP_TONES; className?: string; children: ReactNode }) {
  return (
    <span className={cn('ll-chip', className)} style={CHIP_TONES[tone]}>
      {children}
    </span>
  )
}

/** A round "Done!", "45%" or "New" sticker on a page. */
export function StatusSticker({
  status,
  size = 64,
  className,
  style,
  children,
}: {
  status: 'done' | 'progress' | 'new'
  size?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <span className={cn('ll-sticker', `ll-sticker-${status}`, className)} style={{ ['--d' as string]: `${size}px`, ...style }}>
      {children}
    </span>
  )
}

/** An on/off switch with a clay knob. Give it a visible label (labelledBy) or an aria-label. */
export function ClayToggle({
  checked,
  onChange,
  label,
  labelledBy,
  describedBy,
  icon,
  tone,
  className,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  labelledBy?: string
  describedBy?: string
  icon?: ReactNode
  /** Knob color when on; defaults to the book accent. */
  tone?: { on: string; onDk: string }
  className?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={cn('ll-toggle', className)}
      style={tone ? { ['--on' as string]: tone.on, ['--on-dk' as string]: tone.onDk } : undefined}
    >
      <span className="ll-toggle-knob">{icon}</span>
    </button>
  )
}

export interface ClayFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Keep the label for screen readers only; the placeholder shows the label instead. */
  hideLabel?: boolean
  error?: string | null
  hint?: ReactNode
}

/** A rounded, pressed-in text field. Password fields get an eye button to show what was typed. */
export const ClayField = forwardRef<HTMLInputElement, ClayFieldProps>(function ClayField(
  { label, hideLabel, error, hint, id, className, placeholder, type, ...rest },
  ref,
) {
  const auto = useId()
  const fieldId = id ?? auto
  const noteId = `${fieldId}-note`
  const isPassword = type === 'password'
  const [shown, setShown] = useState(false)
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className={hideLabel ? 'sr-only' : 'px-1 font-display text-[1.125rem] font-semibold text-ink-deep'}>
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={fieldId}
          className={cn('ll-field', isPassword && 'pr-16')}
          placeholder={placeholder ?? (hideLabel ? label : undefined)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? noteId : undefined}
          type={isPassword && shown ? 'text' : type}
          {...rest}
        />
        {isPassword ? (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label="Show password"
            aria-pressed={shown}
            className="absolute top-1/2 right-2.5 grid size-11 -translate-y-1/2 place-items-center rounded-full text-graphite hover:bg-cream hover:text-ink"
          >
            {shown ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        ) : null}
      </div>
      {error || hint ? (
        <p id={noteId} className={cn('px-4 text-[0.9375rem] font-semibold', error ? 'text-error' : 'text-graphite')}>
          {error || hint}
        </p>
      ) : null}
    </div>
  )
})

/** A friendly error box for a form, read out when it appears. */
export function FormNote({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="rounded-2xl bg-[#f8dcdc] px-4 py-3 text-[1rem] font-semibold text-error">
      {children}
    </p>
  )
}

/** A clay fridge magnet (decorative). */
export function Magnet({ color = 'var(--ll-cran)', className, style }: { color?: string; className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn('ll-magnet', className)} style={{ ['--m' as string]: color, ...style }} />
}

/** Words painted onto a blank signpost in a scene; the whole sign is the link. */
export function SignLabel({ className, ...rest }: LinkProps) {
  return <Link className={cn('ll-sign', className)} {...rest} />
}

/** Progress drawn like a crayon stroke. */
export function CrayonProgress({
  value,
  max = 100,
  color = 'var(--ll-gold)',
  label,
  valueText,
  className,
}: {
  value: number
  max?: number
  color?: string
  label: string
  valueText?: string
  className?: string
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={valueText}
      className={cn('ll-crayon-track', className)}
    >
      <div className="ll-crayon-fill" style={{ width: `${pct}%`, ['--f' as string]: color }} />
    </div>
  )
}
