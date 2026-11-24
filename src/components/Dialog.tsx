import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Centered sheet over a dimmed backdrop. Escape or the close button dismisses it. */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    panel.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus()
    }
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-deep/45 px-4 backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-[28px] bg-snow px-6 pt-10 pb-8 shadow-paper outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-graphite hover:bg-frost"
        >
          <X className="size-5" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
