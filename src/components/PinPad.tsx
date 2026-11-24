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
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'] as const

export function PinPad({ title, subtitle, mode = 'verify', onSubmit, accent = 'var(--color-ink)', className }: PinPadProps) {
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

  return (
    <div className={cn('flex flex-col items-center text-center', className)}>
      <h2 className="font-display text-heading font-bold text-ink-deep">{heading}</h2>
      {subtitle && !(mode === 'create' && first !== null) ? (
        <p className="mt-1 max-w-xs text-graphite">{subtitle}</p>
      ) : null}

      <div key={shakeKey} className={cn('mt-6 flex gap-4', shakeKey > 0 && 'animate-shake')} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="size-4 rounded-full ring-2 ring-inset transition-colors"
            style={{
              backgroundColor: i < pin.length ? accent : 'transparent',
              ['--tw-ring-color' as string]: i < pin.length ? accent : 'var(--color-mist)',
            }}
          />
        ))}
      </div>
      <p role="status" aria-live="polite" className="mt-3 min-h-6 text-[0.9375rem] text-error">
        {message ?? (busy ? <span className="text-graphite">Checking…</span> : null)}
      </p>
      <span className="sr-only">{`${pin.length} of 4 digits entered`}</span>

      <div className="mt-2 grid grid-cols-3 gap-3">
        {KEYS.map((key) =>
          key === '' ? (
            <span key="spacer" />
          ) : (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              disabled={busy}
              aria-label={key === 'back' ? 'Delete last digit' : key}
              className={cn(
                'grid size-18 place-items-center rounded-full font-display text-[1.75rem] font-bold text-ink-deep transition-transform active:scale-90',
                key === 'back' ? 'text-graphite hover:bg-frost' : 'bg-paper shadow-lift hover:bg-frost',
              )}
            >
              {key === 'back' ? <Delete className="size-7" strokeWidth={2.2} /> : key}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
