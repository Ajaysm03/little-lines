import { cn } from './ui'

/**
 * "Little Lines" set in the hand-drawn display face with a crayon squiggle under it.
 * `animate` draws the squiggle on once (used on the welcome screen only).
 */
export function Wordmark({ size = 'md', animate = false, className }: { size?: 'sm' | 'md' | 'lg'; animate?: boolean; className?: string }) {
  const text = { sm: 'text-[1.25rem]', md: 'text-[1.75rem]', lg: 'text-[2.5rem]' }[size]
  return (
    <span className={cn('relative inline-flex flex-col self-start leading-none', className)}>
      <span className={cn('font-display font-extrabold tracking-tight text-ink', text)}>Little Lines</span>
      <svg viewBox="0 0 200 14" preserveAspectRatio="none" className="-mt-0.5 h-[0.4em] w-full" aria-hidden>
        <path
          d="M3 9 C 30 2, 45 13, 70 7 S 115 2, 138 8 S 180 12, 197 5"
          fill="none"
          stroke="var(--color-sunflower)"
          strokeWidth="5"
          strokeLinecap="round"
          pathLength={1}
          className={animate ? 'wordmark-squiggle' : undefined}
        />
      </svg>
      <style>{`
        .wordmark-squiggle { stroke-dasharray: 1; stroke-dashoffset: 1; animation: wordmark-draw .7s .2s ease-out forwards; }
        @keyframes wordmark-draw { to { stroke-dashoffset: 0; } }
      `}</style>
    </span>
  )
}
