import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../ui'
import { ClayButton, ClayLink } from './index'
import { Scene, useSceneLayout } from './Scene'

/**
 * The grown-ups desk behind every grown-ups screen: a clay back button, an optional heading on the wall,
 * and the screen's paper cards, scrolling over the picture (or below the picture band on phones).
 */
export function GrownupsFrame({
  back,
  title,
  subtitle,
  width = 'max-w-[68rem]',
  center,
  children,
}: {
  back: { label: string; to?: string; onClick?: () => void }
  title?: ReactNode
  subtitle?: ReactNode
  width?: string
  /** Center the content vertically (the PIN gate). */
  center?: boolean
  children: ReactNode
}) {
  return (
    <Scene scene="grownups" className="h-dvh">
      <Body back={back} title={title} subtitle={subtitle} width={width} center={center}>
        {children}
      </Body>
    </Scene>
  )
}

function Body({ back, title, subtitle, width, center, children }: Parameters<typeof GrownupsFrame>[0]) {
  const { layout } = useSceneLayout()
  const band = layout === 'band'
  const backButton = back.to ? (
    <ClayLink to={back.to} tone="cream" size="sm" className="!pr-6 !pl-4">
      <ArrowLeft className="size-6" strokeWidth={2.6} aria-hidden /> {back.label}
    </ClayLink>
  ) : (
    <ClayButton tone="cream" size="sm" onClick={back.onClick} className="!pr-6 !pl-4">
      <ArrowLeft className="size-6" strokeWidth={2.6} aria-hidden /> {back.label}
    </ClayButton>
  )
  const inner = (
    <div className={cn('mx-auto flex w-full flex-col px-4 sm:px-8', width, center ? 'min-h-full justify-center py-8' : band ? 'pb-12' : 'py-8')}>
      <div className={cn(band && '-mt-7', center && !band && 'absolute top-6 left-6')}>{backButton}</div>
      {title ? (
        <header className="mt-6 text-center">
          <h1 className="font-display text-[2.5rem] leading-none font-semibold text-[#33251b] sm:text-[3.5rem] lg:text-[4.25rem]">{title}</h1>
          {subtitle ? <p className="mt-3 text-[1.125rem] font-bold text-[#33251b] sm:text-[1.3125rem]">{subtitle}</p> : null}
        </header>
      ) : null}
      <main className={cn(title ? 'mt-8' : center && !band ? '' : 'mt-8')}>{children}</main>
    </div>
  )
  if (band) return inner
  return <div className="pointer-events-auto absolute inset-0 overflow-y-auto">{inner}</div>
}
