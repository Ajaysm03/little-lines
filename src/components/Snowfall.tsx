import { useEffect, useRef } from 'react'
import type { Book } from '../content/books'
import { cn } from './ui'

const SNOWY = ['christmas', 'winter', 'snow']

/** Books about winter get snowfall behind them. */
export function isSnowyBook(book: Book): boolean {
  return book.tags.some((t) => SNOWY.includes(t.toLowerCase()))
}

/**
 * Gentle snow falling behind the book. Soft flakes in three depths, drifting
 * sideways. Draws nothing when the reader prefers reduced motion, and pauses
 * while the tab is hidden.
 */
export function Snowfall({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const ctx = canvas.getContext('2d')!
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    let w = 0
    let h = 0
    const resize = () => {
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const flakes = Array.from({ length: 90 }, () => {
      const depth = Math.random()
      return {
        x: Math.random(),
        y: Math.random(),
        r: 0.8 + depth * 2.4,
        speed: 0.012 + depth * 0.03,
        sway: Math.random() * Math.PI * 2,
        alpha: 0.25 + depth * 0.5,
      }
    })

    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = Math.min(64, now - last) / 1000
      last = now
      ctx.clearRect(0, 0, w, h)
      for (const f of flakes) {
        f.y += f.speed * dt * 6
        f.sway += dt * 0.8
        f.x += Math.sin(f.sway) * 0.0004
        if (f.y > 1.02) {
          f.y = -0.02
          f.x = Math.random()
        }
        ctx.beginPath()
        ctx.arc(f.x * w, f.y * h, f.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${f.alpha})`
        ctx.fill()
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    const onVis = () => {
      cancelAnimationFrame(frame)
      if (document.visibilityState === 'visible') {
        last = performance.now()
        frame = requestAnimationFrame(tick)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelAnimationFrame(frame)
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 size-full', className)} />
}
