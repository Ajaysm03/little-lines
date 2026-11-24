/** Color helpers: conversions, mixing, and "colors that go together" suggestions. */

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

/** Blend `hex` toward `toward` by `t` (0–1). */
export function mix(hex: string, toward: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(hex)
  const [r2, g2, b2] = hexToRgb(toward)
  return rgbToHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
}

export function hexToHsl(hex: string): [h: number, s: number, l: number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l * 100]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  return [h * 60, s * 100, l * 100]
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360
  const ss = Math.max(0, Math.min(100, s)) / 100
  const ll = Math.max(0, Math.min(100, l)) / 100
  if (ss === 0) return rgbToHex(ll * 255, ll * 255, ll * 255)
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const f = (t: number) => {
    let x = t
    if (x < 0) x += 1
    if (x > 1) x -= 1
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return rgbToHex(f(hh + 1 / 3) * 255, f(hh) * 255, f(hh - 1 / 3) * 255)
}

export type Harmony = 'opposites' | 'neighbors' | 'triangle' | 'light-dark'

export const HARMONIES: Array<{ id: Harmony; label: string }> = [
  { id: 'opposites', label: 'Opposites' },
  { id: 'neighbors', label: 'Neighbors' },
  { id: 'triangle', label: 'Triangle' },
  { id: 'light-dark', label: 'Light to dark' },
]

/**
 * Five colors that sit well with `hex`, by color-wheel rule. Grays and near-black
 * get a gentle color so suggestions are never all gray.
 */
export function suggestColors(hex: string, harmony: Harmony): string[] {
  let [h, s, l] = hexToHsl(hex)
  if (s < 12) s = 45
  l = Math.max(28, Math.min(72, l))
  switch (harmony) {
    case 'opposites':
      return [hslToHex(h + 180, s, l), hslToHex(h + 180, s, l + 18), hslToHex(h, s, l + 22), hslToHex(h, s, l - 18), hslToHex(h + 180, s, l - 16)]
    case 'neighbors':
      return [hslToHex(h - 60, s, l), hslToHex(h - 30, s, l), hslToHex(h + 30, s, l), hslToHex(h + 60, s, l), hslToHex(h + 30, s, l + 18)]
    case 'triangle':
      return [hslToHex(h + 120, s, l), hslToHex(h + 240, s, l), hslToHex(h + 120, s, l + 18), hslToHex(h + 240, s, l + 18), hslToHex(h, s, l - 18)]
    case 'light-dark':
      return [88, 74, 58, 42, 26].map((ll) => hslToHex(h, s, ll))
  }
}
