import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Keyboard handling for a modal panel (dialogs, sheets): focus moves in when it opens, Tab and
 * Shift+Tab stay inside, Escape closes it, and focus goes back to where it was (or `restore()`)
 * after it closes. Runs once per open, however often the parent re-renders.
 */
export function useModal(
  panel: RefObject<HTMLElement | null>,
  onClose: () => void,
  opts: { initial?: RefObject<HTMLElement | null>; restore?: () => HTMLElement | null | undefined } = {},
) {
  const close = useRef(onClose)
  close.current = onClose
  const restore = useRef(opts.restore)
  restore.current = opts.restore
  const initial = opts.initial

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ;(initial?.current ?? panel.current)?.focus()
    const onKey = (e: KeyboardEvent) => {
      const box = panel.current
      if (!box) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0)
      if (items.length === 0) {
        e.preventDefault()
        box.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === box || !box.contains(active))) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (active === last || !box.contains(active))) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      // After React has committed the close, so the element to return to exists again.
      requestAnimationFrame(() => {
        const back = restore.current?.() ?? previous
        if (back?.isConnected) back.focus()
      })
    }
  }, [panel, initial])
}
