import { ButtonLink } from '../components/ui'
import { useTitle } from '../lib/useTitle'

export function NotFound() {
  useTitle('Page not found')
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div className="flex flex-col items-center">
        <h1 className="font-display text-title font-extrabold text-ink-deep">This page isn’t in any book</h1>
        <p className="mt-2 text-graphite">The link may be old. Head home to find your books.</p>
        <ButtonLink to="/" className="mt-6">
          Go home
        </ButtonLink>
      </div>
    </main>
  )
}
