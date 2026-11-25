import type { KeyboardEvent } from 'react'

/**
 * Arrow keys for a radio group (role="radiogroup" around role="radio" buttons): move to the next or
 * previous option and choose it. Pair with `rovingTab` so the group is a single Tab stop.
 */
export function rovingKeys(e: KeyboardEvent<HTMLElement>) {
  const step = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key]
  if (!step && e.key !== 'Home' && e.key !== 'End') return
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=radio]')]
  const i = radios.indexOf(document.activeElement as HTMLElement)
  if (i < 0) return
  e.preventDefault()
  const next = e.key === 'Home' ? 0 : e.key === 'End' ? radios.length - 1 : (i + step + radios.length) % radios.length
  radios[next].focus()
  radios[next].click()
}

/** tabIndex for option `i`: the chosen one is the Tab stop, or the first when none is chosen. */
export function rovingTab(chosen: boolean, i: number, anyChosen: boolean): 0 | -1 {
  return chosen || (!anyChosen && i === 0) ? 0 : -1
}
