import { Delete } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from './ui'

export type PinResult = 'ok' | 'wrong' | 'locked'

interface PinPadProps {
  title: string
  subtitle?: string
  /**
   * verify: one entry, checked by onSubmit.
   * create: entry plus a confirmation; onSubmit gets the confirmed PIN.
   */
  mode?: 'verify' | 'create'
  onSubmit: (pin: string) => Promise<PinResult | void> | PinResult | void
  accent?: string
  className?: string
  /** The heading level (1 when the PIN pad is the whole screen). */
  headingLevel?: 1 | 2
  /** Move focus to the heading when the PIN pad appears (it replaced other content). */
  focusHeading?: boolean
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function PinPad({ title, subtitle, mode = 'verify', onSubmit, accent, className, headingLevel = 2, focusHeading }: PinPadProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusHeading) headingRef.current?.focus()
  }, [focusHeading])
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const fail = useCallback((text: string) => {
    setMessage(text)
    setShakeKey((k) => k + 1)
    setPin('')
  }, [])

  const submit = useCallback(
    async (value: string) => {
      if (mode === 'create' && first === null) {
        setFirst(value)
        setPin('')
        setMessage(null)
        return
      }
      if (mode === 'create' && first !== value) {
        setFirst(null)
        fail('Those PINs didn’t match. Choose a PIN again.')
        return
      }
      busyRef.current = true
      setBusy(true)
      try {
        const result = await onSubmit(value)
        if (result === 'wrong') fail('That PIN isn’t right. Try again.')
        else if (result === 'locked') fail('Too many tries. Wait 30 seconds, then try again.')
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [fail, first, mode, onSubmit],
  )

  const press = useCallback((key: string) => {
    if (busyRef.current) return
    setPin((p) => (key === 'back' ? p.slice(0, -1) : p.length >= 4 ? p : p + key))
  }, [])

  // Submit once the fourth digit lands. Kept out of the state updater, which React may run twice.
  const submitRef = useRef(submit)
  submitRef.current = submit
  useEffect(() => {
    if (pin.length === 4) void submitRef.current(pin)
  }, [pin])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (/^\d$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') press('back')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [press])

  const heading = mode === 'create' && first !== null ? 'Enter the same PIN again' : title
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <Heading ref={headingRef} tabIndex={-1} className="font-display text-title font-semibold text-ink outline-none">
        {heading}
      </Heading>
      {subtitle && !(mode === 'create' && first !== null) ? (
        <p className="mt-1 max-w-xs text-graphite">{subtitle}</p>
      ) : null}

      <div key={shakeKey} className={cn('mt-6 flex gap-4', shakeKey > 0 && 'animate-shake')} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('ll-pin-dot', i < pin.length && 'll-pin-dot-on')} style={i < pin.length && accent ? { background: accent } : undefined} />
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-6 text-[0.9375rem] text-error">
        {message ?? (busy ? <span className="text-graphite">Checking…</span> : mode === 'create' && first !== null ? <span className="sr-only">Now enter the same PIN again.</span> : null)}
      </p>
      <span className="sr-only">{`${pin.length} of 4 digits entered`}</span>

      <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-4">
        {KEYS.map((key) =>
          key === '' ? (
            <span key="spacer" />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              aria-disabled={busy || undefined}
              aria-label={key === 'back' ? 'Delete last digit' : key}
              className="ll-clay ll-tone-cream ll-clay-round text-[2rem]"
              style={{ ['--d' as string]: '76px' }}
            >
              {key === 'back' ? <Delete className="size-7" strokeWidth={2.2} aria-hidden /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
