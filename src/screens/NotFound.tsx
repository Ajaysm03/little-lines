import { House } from 'lucide-react'
import { ClayLink, PaperCard, Tape } from '../components/cozy'
import { Scene, useSceneLayout } from '../components/cozy/Scene'
import { useTitle } from '../lib/useTitle'

/** A lost page: a taped note in the snowy village pointing back home. */
export function NotFound() {
  useTitle('Page not found')
  return (
    <Scene scene="home" snow className="h-dvh">
      <Note />
    </Scene>
  )
}

function Note() {
  const { layout } = useSceneLayout()
  const card = (
    <div className="relative w-full max-w-[33rem] -rotate-1">
      <Tape variant="kraft" className="-top-3 left-24 -rotate-6" />
      <Tape variant="kraft" className="-top-3 right-24 rotate-[5deg]" />
      <PaperCard className="flex flex-col items-center px-8 pt-10 pb-9 text-center sm:px-12">
        <svg viewBox="0 0 120 80" className="h-20 w-28" aria-hidden>
          <path d="M8 18 Q60 8 60 22 L60 74 Q60 60 8 70 Z" fill="#fffdf8" stroke="#cdb68f" strokeWidth="3" strokeLinejoin="round" />
          <path d="M112 18 Q60 8 60 22 L60 74 Q60 60 112 70 Z" fill="#fffdf8" stroke="#cdb68f" strokeWidth="3" strokeLinejoin="round" />
          <text x="86" y="52" textAnchor="middle" fontFamily="Fredoka Variable, sans-serif" fontWeight="600" fontSize="26" fill="#b7334b">?</text>
        </svg>
        <h1 className="mt-4 font-display text-[2.25rem] leading-[1.05] font-semibold text-ink sm:text-[2.75rem]">This page isn’t in any book</h1>
        <p className="mt-3 text-[1.25rem] leading-snug font-bold text-[#5a4434]">The link may be old. Head home to find your books.</p>
        <ClayLink to="/" tone="honey" className="mt-7 w-full max-w-[17.5rem]">
          <House className="size-6" aria-hidden /> Go home
        </ClayLink>
      </PaperCard>
    </div>
  )
  if (layout === 'band') return <main className="-mt-8 flex justify-center px-4 pb-12">{card}</main>
  return <main className="pointer-events-auto absolute inset-0 grid place-items-center overflow-y-auto px-4 py-8">{card}</main>
}
