import type { ReactNode } from 'react'
import { PaperCard, Tape } from '../components/cozy'
import { Scene, useSceneLayout } from '../components/cozy/Scene'
import { Wordmark } from '../components/Wordmark'

/** The family's art desk behind a taped paper card holding the form. Phones get the desk as a band above. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <Scene scene="login" className="h-dvh">
      <AuthCard>{children}</AuthCard>
    </Scene>
  )
}

function AuthCard({ children }: { children: ReactNode }) {
  const { layout } = useSceneLayout()
  const card = (
    <div className="relative w-full max-w-[36rem]">
      <Tape className="-top-3 -left-5 -rotate-[32deg]" />
      <Tape variant="mint" className="-top-3 -right-5 rotate-[32deg]" />
      <Tape variant="mint" className="-bottom-3 -left-5 rotate-[30deg]" />
      <Tape className="-right-5 -bottom-3 -rotate-[30deg]" />
      <PaperCard className="px-6 pt-7 pb-8 sm:px-12 sm:pt-9 sm:pb-10">
        <Wordmark size="md" animate />
        <main className="mt-7">{children}</main>
      </PaperCard>
    </div>
  )

  if (layout === 'band') {
    return (
      <div className="-mt-8 flex flex-col items-center px-4 pb-10">
        {card}
        <Footnote />
      </div>
    )
  }
  return (
    <div className="pointer-events-auto absolute inset-0 overflow-y-auto">
      <div className="flex min-h-full flex-col items-end justify-center py-10 pr-[max(1.5rem,5vw)] pl-6">
        {card}
        <div className="w-full max-w-[36rem]">
          <Footnote onScene />
        </div>
      </div>
    </div>
  )
}

function Footnote({ onScene }: { onScene?: boolean }) {
  return (
    <p
      className={
        onScene
          ? 'mx-auto mt-6 w-fit rounded-2xl bg-[#3e2a1e]/70 px-4 py-2 text-center text-[0.875rem] font-semibold text-white backdrop-blur-sm'
          : 'mt-6 max-w-[36rem] text-center text-[0.875rem] font-semibold text-graphite'
      }
    >
      Your family’s pages are saved to your account, so you can pick up on any device. Coloring keeps working offline too.
    </p>
  )
}
