import { Palette } from 'lucide-react'
import { ButtonLink } from '../components/ui'

export function GalleryScreen() {
  return (
    <main className="w-full max-w-6xl px-4 pt-6 pb-12 sm:px-8 md:pt-10 lg:px-12">
      <h1 className="font-display text-title font-extrabold text-ink-deep">My art</h1>
      <div className="mt-10 flex max-w-lg flex-col items-start rounded-[28px] bg-paper px-6 py-8 shadow-paper sm:px-8">
        <Palette className="size-10 text-[var(--crayon)]" />
        <h2 className="mt-4 font-display text-heading font-bold text-ink-deep">Your gallery is waiting</h2>
        <p className="mt-2 text-graphite">Every page you color shows up here, ready to show off.</p>
        <ButtonLink to="/library" className="mt-6">
          Pick a page to color
        </ButtonLink>
      </div>
    </main>
  )
}
