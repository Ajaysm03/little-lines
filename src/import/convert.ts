import { hexToHsl, rgbToHex } from '../coloring/colors'

/**
 * Pixel work for turning PDF pages into coloring-book pages. These take plain
 * RGBA arrays so they can be tested without a browser.
 */

/** Ink below this alpha is paper noise, dropped so fills stay clean. */
const NOISE = 10

/**
 * Black line art on transparency: the darker a pixel, the more opaque the ink.
 * Writes into `out` (RGBA). Gray pages turn into soft gray lines, which still fill fine.
 */
export function toLineArt(rgba: Uint8ClampedArray, out: Uint8ClampedArray): void {
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]
    // Fold the page's own transparency in, treating see-through pixels as paper.
    const a = rgba[i + 3] / 255
    let ink = (255 - lum) * a
    ink = ink < NOISE ? 0 : Math.min(255, (ink - NOISE) * (255 / (255 - NOISE)))
    out[i] = out[i + 1] = out[i + 2] = 0
    out[i + 3] = ink
  }
}

/**
 * How colorful a page is, 0–1: the share of clearly saturated pixels. Line-art
 * pages are near 0; painted covers are well above 0.15.
 */
export function colorfulness(rgba: Uint8ClampedArray): number {
  let colorful = 0
  let total = 0
  for (let i = 0; i < rgba.length; i += 16) {
    const r = rgba[i]
    const g = rgba[i + 1]
    const b = rgba[i + 2]
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    total++
    if (max - min > 48 && max > 40) colorful++
  }
  return total ? colorful / total : 0
}

export const COLOR_PAGE = 0.15

/**
 * A crayon box for an imported book, pulled from its cover: k-means over the
 * cover's pixels, then sorted by hue. Always includes white and a near-black.
 */
export function extractPalette(rgba: Uint8ClampedArray, count = 14): string[] {
  const pts: Array<[number, number, number]> = []
  for (let i = 0; i < rgba.length; i += 4 * 7) pts.push([rgba[i], rgba[i + 1], rgba[i + 2]])
  if (pts.length === 0) return []
  // Farthest-point seeding: each new center is the sample least like the ones chosen so far,
  // so every distinct color on the cover gets a center of its own.
  const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2
  let centers: Array<[number, number, number]> = [pts[0].slice() as [number, number, number]]
  const nearest = pts.map((p) => dist2(p, centers[0]))
  while (centers.length < count) {
    let far = 0
    for (let i = 1; i < pts.length; i++) if (nearest[i] > nearest[far]) far = i
    if (nearest[far] === 0) break // fewer distinct colors than centers
    const c = pts[far].slice() as [number, number, number]
    centers.push(c)
    for (let i = 0; i < pts.length; i++) nearest[i] = Math.min(nearest[i], dist2(pts[i], c))
  }
  for (let iter = 0; iter < 8; iter++) {
    const sums = centers.map(() => [0, 0, 0, 0])
    for (const p of pts) {
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      const s = sums[best]
      s[0] += p[0]
      s[1] += p[1]
      s[2] += p[2]
      s[3]++
    }
    centers = centers.map((c, i) => (sums[i][3] ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]] : c))
  }
  // Drop near-duplicates, then make sure the box has paper white and a dark outline color.
  const out: string[] = []
  for (const c of centers) {
    const hex = rgbToHex(c[0], c[1], c[2])
    if (!out.some((o) => distance(o, hex) < 28)) out.push(hex)
  }
  if (!out.some((h) => hexToHsl(h)[2] > 92)) out.push('#ffffff')
  if (!out.some((h) => hexToHsl(h)[2] < 22)) out.push('#2b2b33')
  return out.sort(byHue)
}

function distance(a: string, b: string): number {
  const pa = hexToRgbTuple(a)
  const pb = hexToRgbTuple(b)
  return Math.sqrt((pa[0] - pb[0]) ** 2 + (pa[1] - pb[1]) ** 2 + (pa[2] - pb[2]) ** 2)
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Grays last (light to dark), colors by hue. */
function byHue(a: string, b: string): number {
  const [ha, sa, la] = hexToHsl(a)
  const [hb, sb, lb] = hexToHsl(b)
  const grayA = sa < 15
  const grayB = sb < 15
  if (grayA !== grayB) return grayA ? 1 : -1
  if (grayA) return lb - la
  return ha - hb || la - lb
}

/** Theme colors for the reader and book page, derived from the palette. */
export function themeFrom(palette: string[]): { accent: string; deep: string; glow: string } {
  const info = palette.map((hex) => ({ hex, hsl: hexToHsl(hex) }))
  const colored = info.filter((c) => c.hsl[1] >= 25)
  const pick = (list: typeof info, score: (c: (typeof info)[number]) => number, fallback: string) =>
    list.length ? list.reduce((best, c) => (score(c) > score(best) ? c : best)).hex : fallback
  const deep = pick(colored.filter((c) => c.hsl[2] < 45), (c) => -c.hsl[2] + c.hsl[1] * 0.2, '#1d2f5c')
  const glow = pick(colored.filter((c) => c.hsl[2] >= 55 && c.hex !== deep), (c) => c.hsl[1] + c.hsl[2] * 0.3, '#f2b84b')
  const accent = pick(
    colored.filter((c) => c.hsl[2] > 30 && c.hsl[2] < 65 && c.hex !== deep && c.hex !== glow),
    (c) => c.hsl[1] - Math.abs(c.hsl[2] - 48),
    '#c8283a',
  )
  return { deep, accent, glow }
}
