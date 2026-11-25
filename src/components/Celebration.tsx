import { ArrowRight, BookOpen, Paintbrush } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { StickerState } from '../data/achievements'
import { useModal } from '../lib/useModal'
import { ClayButton, Magnet, Tape } from './cozy'

const CONFETTI = ['#e0475b', '#f28a2e', '#f2c230', '#3ba55c', '#3d8be8', '#8559d9', '#ffffff']

/**
 * Shown when a child says "I'm finished": crayon confetti, their page on a taped paper card,
 * a new sticker if they just earned one, and what to do next.
 */
export function Celebration({
  pageTitle,
  colorUrl,
  lineArt,
  sticker,
  nextTitle,
  onNext,
  onFridge,
  onBook,
  onKeep,
}: {
  pageTitle: string
  colorUrl: string | null
  lineArt: string
  sticker?: StickerState
  nextTitle?: string
  onNext?: () => void
  onFridge: () => void
  onBook: () => void
  onKeep: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const firstButton = useRef<HTMLButtonElement>(null)

  const dialog = useRef<HTMLDivElement>(null)
  // Focus starts on the first choice, stays inside, Escape keeps coloring, and closing returns focus.
  useModal(dialog, onKeep, { initial: firstButton })

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
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[radial-gradient(circle_at_50%_45%,rgb(255_214_140/0.35),rgb(60_30_10/0.6)_75%)] px-4 py-8">
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none fixed inset-0 size-full" />
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby="done-h" tabIndex={-1} className="relative w-full max-w-[59rem] outline-none">
        <Tape variant="rainbow" className="-top-3 left-1/2 !w-48 -translate-x-1/2 -rotate-3" />
        <section className="ll-paper ll-rise flex flex-col items-center gap-8 px-6 pt-10 pb-8 sm:flex-row sm:items-start sm:gap-12 sm:px-12 sm:pt-14 sm:pb-12">
          <div className="relative w-56 shrink-0 -rotate-[2.5deg] rounded-md bg-[#fffdf8] p-3 shadow-[0_2px_0_rgb(0_0_0/0.06),12px_16px_24px_-10px_rgb(60_35_15/0.55)] sm:w-[22rem]">
            <span className="relative block aspect-[210/297] overflow-hidden rounded-[3px]">
              {colorUrl ? <img src={colorUrl} alt="" className="absolute inset-0 size-full" /> : null}
              <img src={lineArt} alt={`${pageTitle}, all colored in`} className="absolute inset-0 size-full" />
            </span>
            <Magnet className="absolute -top-[18px] left-1/2 -translate-x-1/2" />
          </div>

          <div className="flex w-full min-w-0 flex-col sm:pt-2.5">
            <h2 id="done-h" className="text-center font-display text-[2.5rem] leading-none font-semibold text-ink sm:text-left sm:text-[3.5rem]">
              You finished it!
            </h2>
            <p className="mt-3 text-center text-[1.25rem] leading-snug font-bold text-[#5a4434] sm:text-left sm:text-[1.5rem]">{pageTitle} is all colored in.</p>

            {sticker ? (
              <div role="status" className="mt-7 flex items-center gap-5 rounded-[18px] bg-[#f3e8d3] px-5 py-4 shadow-[inset_0_2px_6px_rgb(90_60_30/0.15)]">
                <span className="ll-sticker-disc ll-pop-in shrink-0" style={{ ['--d' as string]: '88px', ['--s' as string]: sticker.color }} aria-hidden>
                  {sticker.emoji}
                </span>
                <div>
                  <p className="text-[0.9375rem] font-bold tracking-wide text-graphite uppercase">New sticker</p>
                  <p className="mt-1 font-display text-[1.75rem] leading-none font-semibold text-[#1e5836]">{sticker.title}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-8 flex flex-col gap-4">
              {onNext ? (
                <ClayButton ref={firstButton} tone="cran" size="lg" onClick={onNext} className="max-w-full">
                  <span className="truncate">Next page{nextTitle ? `: ${nextTitle}` : ''}</span>
                  <ArrowRight className="size-7 shrink-0" strokeWidth={2.6} aria-hidden />
                </ClayButton>
              ) : null}
              <ClayButton ref={onNext ? undefined : firstButton} tone="pine" onClick={onFridge}>
                Hang it on the fridge
              </ClayButton>
              <div className="flex flex-wrap gap-4">
                <ClayButton tone="cream" onClick={onBook} className="flex-1">
                  <BookOpen className="size-6" aria-hidden /> Back to the book
                </ClayButton>
                <ClayButton tone="cream" onClick={onKeep} className="flex-1">
                  <Paintbrush className="size-6" aria-hidden /> Keep coloring
                </ClayButton>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>,
    document.body,
  )
}
