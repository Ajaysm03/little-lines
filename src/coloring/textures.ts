import { hexToRgb } from './colors'

/**
 * Paper-grain textures for the crayon, colored pencil and watercolor brushes.
 * Each brush strokes with a repeating pattern: the color where the "paper
 * tooth" catches it and gaps where it doesn't. Because the pattern is fixed to
 * the page (not the stroke), going over an area again hits the same tooth,
 * just like real crayon on paper.
 */
export type Texture = 'crayon' | 'pencil' | 'watercolor'

const TILE = 256
const grains = new Map<Texture, Uint8ClampedArray>()
const patterns = new Map<string, CanvasPattern>()

/** Smooth random noise (0–255) built by upscaling small random images, two octaves. */
function noise(cells: number[]): Float32Array {
  const out = new Float32Array(TILE * TILE)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = TILE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const weightSum = cells.reduce((s, _c, i) => s + 1 / (i + 1), 0)
  cells.forEach((n, octave) => {
    // n×n random values plus a one-cell wrapped border, so smoothing across the
    // tile's edges blends with the opposite side and the pattern repeats seamlessly.
    const values = Array.from({ length: n * n }, () => Math.random() * 255)
    const small = document.createElement('canvas')
    small.width = small.height = n + 2
    const sctx = small.getContext('2d')!
    const img = sctx.createImageData(n + 2, n + 2)
    for (let y = 0; y < n + 2; y++) {
      for (let x = 0; x < n + 2; x++) {
        const v = values[((y - 1 + n) % n) * n + ((x - 1 + n) % n)]
        const o = (y * (n + 2) + x) * 4
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v
        img.data[o + 3] = 255
      }
    }
    sctx.putImageData(img, 0, 0)
    const cell = TILE / n
    ctx.imageSmoothingEnabled = true
    ctx.clearRect(0, 0, TILE, TILE)
    ctx.drawImage(small, -cell, -cell, (n + 2) * cell, (n + 2) * cell)
    const px = ctx.getImageData(0, 0, TILE, TILE).data
    const w = 1 / (octave + 1) / weightSum
    for (let i = 0; i < out.length; i++) out[i] += (px[i * 4] / 255) * w
  })
  return out
}

function grain(kind: Texture): Uint8ClampedArray {
  const cached = grains.get(kind)
  if (cached) return cached
  const a = new Uint8ClampedArray(TILE * TILE)
  if (kind === 'crayon') {
    // Coarse, waxy: most of the page catches color, with clumpy gaps.
    const n = noise([48, 96, 192])
    for (let i = 0; i < a.length; i++) a[i] = Math.max(0, Math.min(1, (n[i] - 0.36) * 4.2)) * 255
  } else if (kind === 'pencil') {
    // Fine and lighter: soft grain with more paper showing.
    const n = noise([96, 192, 256])
    for (let i = 0; i < a.length; i++) a[i] = Math.pow(Math.max(0, Math.min(1, (n[i] - 0.32) * 3.2)), 0.7) * 255
  } else {
    // Watercolor: nearly even, with a soft paper texture.
    const n = noise([32, 128])
    for (let i = 0; i < a.length; i++) a[i] = 175 + n[i] * 80
  }
  grains.set(kind, a)
  return a
}

/** A repeating pattern in `color` with the brush's paper grain. Cached per color. */
export function texturePattern(ctx: CanvasRenderingContext2D, kind: Texture, color: string): CanvasPattern | string {
  const key = `${kind}:${color.toLowerCase()}`
  const hit = patterns.get(key)
  if (hit) return hit
  try {
    const tile = document.createElement('canvas')
    tile.width = tile.height = TILE
    const tctx = tile.getContext('2d')!
    const img = tctx.createImageData(TILE, TILE)
    const [r, g, b] = hexToRgb(color)
    const alpha = grain(kind)
    for (let i = 0; i < alpha.length; i++) {
      const o = i * 4
      img.data[o] = r
      img.data[o + 1] = g
      img.data[o + 2] = b
      img.data[o + 3] = alpha[i]
    }
    tctx.putImageData(img, 0, 0)
    const pattern = ctx.createPattern(tile, 'repeat')
    if (!pattern) return color
    if (patterns.size > 48) patterns.delete(patterns.keys().next().value!)
    patterns.set(key, pattern)
    return pattern
  } catch {
    return color
  }
}
