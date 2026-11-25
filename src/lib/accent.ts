import type { CSSProperties } from 'react'
import type { BookTheme } from '../content/books'

/** Cocoa ink, the dark text color of the cozy look. */
export const INK = '#3e2a1e'
const WHITE = '#ffffff'

function channels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
}

/** WCAG relative luminance of a #rrggbb color. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio between two colors (1–21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mixes a color toward black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  return toHex(channels(hex).map((v) => v * (1 - amount)) as [number, number, number])
}

export interface Accent {
  /** The button color. */
  acc: string
  /** The darker clay lip under the button. */
  accDk: string
  /** Text and icons on the button: white or cocoa, whichever reads best. */
  onAcc: string
}

/**
 * Button colors for a book. Text on the button is white or cocoa ink, whichever contrasts more; if neither
 * reaches 4.5:1 the color is deepened until white text does, so labels always stay readable.
 */
export function bookAccent(theme: Pick<BookTheme, 'accent'> | null | undefined): Accent {
  let acc = (theme?.accent ?? '#b7334b').toLowerCase()
  if (!/^#[0-9a-f]{6}$/.test(acc)) acc = '#b7334b'
  let onAcc = contrast(WHITE, acc) >= contrast(INK, acc) ? WHITE : INK
  for (let i = 0; i < 20 && contrast(onAcc, acc) < 4.5; i++) {
    acc = darken(acc, 0.06)
    onAcc = WHITE
  }
  return { acc, accDk: darken(acc, 0.28), onAcc }
}

/** CSS variables for a book's accent, for a `style` prop: `<div style={accentStyle(book.theme)}>`. */
export function accentStyle(theme: Pick<BookTheme, 'accent'> | null | undefined): CSSProperties {
  const a = bookAccent(theme)
  return { ['--acc' as string]: a.acc, ['--acc-dk' as string]: a.accDk, ['--on-acc' as string]: a.onAcc }
}

/** White or cocoa, whichever reads better on `bg`. */
export function textOn(bg: string): string {
  const c = /^#[0-9a-f]{6}$/i.test(bg) ? bg : '#b7334b'
  return contrast('#ffffff', c) >= contrast(INK, c) ? '#ffffff' : INK
}

/** `color`, darkened until it reaches `min` contrast on `bg` (for colored text such as book titles). */
export function readableOn(color: string, bg = '#fbf5e8', min = 3): string {
  let c = /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : '#b7334b'
  for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = darken(c, 0.08)
  return c
}
