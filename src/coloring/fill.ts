import type { RegionData } from './regions'

/** How far a fill reaches under the black lines, so no white halo shows at their soft edges. */
export const FILL_BLEED = 2

export interface FillPatch {
  x: number
  y: number
  width: number
  height: number
  /** RGBA pixels: the fill color where the region is, transparent elsewhere. */
  data: Uint8ClampedArray<ArrayBuffer>
}

/**
 * Pixels to paint for a bucket fill of one region: the region itself plus a
 * thin band of the surrounding line pixels (hidden under the line art anyway).
 */
export function buildFillPatch(map: RegionData, label: number, rgb: [number, number, number]): FillPatch | null {
  if (label <= 0 || label >= map.count) return null
  const { width: W, height: H, labels, bboxes } = map
  const b = label * 4
  const x0 = Math.max(0, bboxes[b] - FILL_BLEED)
  const y0 = Math.max(0, bboxes[b + 1] - FILL_BLEED)
  const x1 = Math.min(W - 1, bboxes[b + 2] + FILL_BLEED)
  const y1 = Math.min(H - 1, bboxes[b + 3] + FILL_BLEED)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1

  // 1 = region; 2..(FILL_BLEED+1) = rings grown into line pixels.
  const mask = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const src = (y + y0) * W + x0
    const dst = y * w
    for (let x = 0; x < w; x++) if (labels[src + x] === label) mask[dst + x] = 1
  }
  for (let ring = 1; ring <= FILL_BLEED; ring++) {
    const mark = ring + 1
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        if (mask[i] !== 0 || labels[(y + y0) * W + x + x0] !== 0) continue
        if (
          (x > 0 && mask[i - 1] > 0 && mask[i - 1] <= ring) ||
          (x < w - 1 && mask[i + 1] > 0 && mask[i + 1] <= ring) ||
          (y > 0 && mask[i - w] > 0 && mask[i - w] <= ring) ||
          (y < h - 1 && mask[i + w] > 0 && mask[i + w] <= ring)
        )
          mask[i] = mark
      }
    }
  }

  const data = new Uint8ClampedArray(w * h * 4)
  const [r, g, bl] = rgb
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue
    const o = i * 4
    data[o] = r
    data[o + 1] = g
    data[o + 2] = bl
    data[o + 3] = 255
  }
  return { x: x0, y: y0, width: w, height: h, data }
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
