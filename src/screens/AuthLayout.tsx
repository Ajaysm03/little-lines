import type { ReactNode } from 'react'
import { ColoringInSheet } from '../components/ColoringInSheet'
import { Wordmark } from '../components/Wordmark'

/** Form on the left, a page being colored in on the right (stacked on phones). */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-4 pt-8 pb-12 sm:px-10 md:min-h-dvh md:px-14 lg:px-20">
        <Wordmark size="md" animate />
        <div className="flex flex-1 flex-col justify-center py-10">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="max-w-md text-[0.875rem] text-graphite">
          Your family’s pages are saved to your account, so you can pick up on any device. Coloring keeps working offline too.
        </p>
      </main>
      <aside
        aria-label="Preview"
        className="relative hidden overflow-hidden bg-ink md:sticky md:top-0 md:flex md:h-dvh md:items-center md:justify-center"
      >
        {/* Desk: soft pencil-box blue with a snowfall of paper dots */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: 'radial-gradient(rgb(255 255 255 / 0.5) 1.2px, transparent 1.3px)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative w-[min(78%,30rem)] -rotate-2">
          <ColoringInSheet />
          <p className="mt-5 rotate-2 text-center font-display text-[1.125rem] text-white/85">
            Trimming the Tree, from Cozy Christmas
          </p>
        </div>
      </aside>
    </div>
  )
}
