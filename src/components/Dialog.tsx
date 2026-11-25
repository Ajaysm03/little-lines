import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useModal } from '../lib/useModal'

/** Centered paper sheet over a dimmed backdrop. Escape or the close button dismisses it; focus stays inside. */
export function Dialog({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useModal(panel, onClose)

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-ink-deep/45 px-4 py-6 backdrop-blur-[2px]" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="ll-paper relative w-full max-w-sm px-6 pt-10 pb-8 outline-none"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 grid size-11 place-items-center rounded-full text-graphite hover:bg-frost"
        >
          <X className="size-5" aria-hidden />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  )
}
