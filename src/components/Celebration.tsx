import { ArrowRight, BookOpen, Paintbrush, Star } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from './ui'

const CONFETTI = ['#e0475b', '#f28a2e', '#f2c230', '#3ba55c', '#3d8be8', '#8559d9', '#ffffff']

/**
 * Shown when a child says "I'm finished": a burst of crayon confetti, their
 * page, and what to do next.
 */
export function Celebration({
  pageTitle,
  colorUrl,
  lineArt,
  nextTitle,
  onNext,
  onBook,
  onKeep,
}: {
  pageTitle: string
  colorUrl: string | null
  lineArt: string
  nextTitle?: string
  onNext?: () => void
  onBook: () => void
  onKeep: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const firstButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    firstButton.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onKeep()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onKeep])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = window.innerWidth * dpr
    canvas.height = window.innerHeight * dpr
    const ctx = canvas.getContext('2d')!
    ctx.scale(dpr, dpr)
    const W = window.innerWidth
    const H = window.innerHeight
    const bits = Array.from({ length: 140 }, () => ({
      x: W / 2 + (Math.random() - 0.5) * 120,
      y: H * 0.45,
      vx: (Math.random() - 0.5) * 14,
      vy: -8 - Math.random() * 10,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 5,
      c: CONFETTI[(Math.random() * CONFETTI.length) | 0],
    }))
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = (now - start) / 1000
      ctx.clearRect(0, 0, W, H)
      for (const b of bits) {
        b.vy += 0.32
        b.vx *= 0.99
        b.x += b.vx
        b.y += b.vy
        b.r += b.vr
        ctx.save()
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 2) / 1.2)
        ctx.translate(b.x, b.y)
        ctx.rotate(b.r)
        ctx.fillStyle = b.c
        ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)))
        ctx.restore()
      }
      if (t < 3.3) frame = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-deep/55 px-4 backdrop-blur-[2px]">
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`You finished ${pageTitle}`}
        className="relative flex w-full max-w-md flex-col items-center rounded-[28px] bg-snow px-6 pt-8 pb-6 text-center shadow-paper"
      >
        <span className="absolute -top-7 grid size-14 place-items-center rounded-full bg-sunflower text-white shadow-lift">
          <Star className="size-8 fill-white" />
        </span>
        <h2 className="mt-2 font-display text-title font-extrabold text-ink-deep">You finished it!</h2>
        <p className="mt-1 text-graphite">{pageTitle} is ready to show off.</p>

        <span className="relative mt-5 block aspect-[210/297] w-40 rotate-[-2deg] overflow-hidden rounded-[4px] bg-paper shadow-paper">
          {colorUrl ? <img src={colorUrl} alt="" className="absolute inset-0 size-full" /> : null}
          <img src={lineArt} alt="" className="absolute inset-0 size-full" />
        </span>

        <div className="mt-6 flex w-full flex-col gap-2.5">
          {onNext ? (
            <button
              ref={firstButton}
              type="button"
              onClick={onNext}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-ink px-6 font-semibold text-white shadow-lift transition-transform active:scale-95"
            >
              Color the next page{nextTitle ? `: ${nextTitle}` : ''} <ArrowRight className="size-5" />
            </button>
          ) : null}
          <button
            ref={onNext ? undefined : firstButton}
            type="button"
            onClick={onBook}
            className={cn(
              'inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-semibold transition-transform active:scale-95',
              onNext ? 'bg-paper text-ink ring-2 ring-inset ring-mist' : 'bg-ink text-white shadow-lift',
            )}
          >
            <BookOpen className="size-5" /> See it in the book
          </button>
          <button
            type="button"
            onClick={onKeep}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 font-semibold text-ink hover:bg-frost"
          >
            <Paintbrush className="size-5" /> Keep coloring
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
