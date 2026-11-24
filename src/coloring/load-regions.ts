import { computeRegions, type RegionData } from './regions'

/** Region maps are kept for the session so reopening a page is instant. */
const cache = new Map<string, Promise<RegionData>>()

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Could not load ${src}`))
    img.src = src
  })
}

/** Builds (or reuses) the region map for a line-art image at the given size. */
export function loadRegions(src: string, width: number, height: number): Promise<RegionData> {
  const key = `${src}@${width}x${height}`
  let pending = cache.get(key)
  if (!pending) {
    pending = build(src, width, height)
    cache.set(key, pending)
    pending.catch(() => cache.delete(key))
  }
  return pending
}

async function build(src: string, width: number, height: number): Promise<RegionData> {
  const img = await loadImage(src)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, width, height)
  const rgba = ctx.getImageData(0, 0, width, height).data
  const alpha = new Uint8Array(width * height)
  for (let i = 0, j = 3; i < alpha.length; i++, j += 4) alpha[i] = rgba[j]
  canvas.width = canvas.height = 0 // release the pixels

  try {
    return await inWorker(alpha, width, height)
  } catch {
    // Workers can be unavailable (old browsers, strict settings); do it here instead.
    return computeRegions(alpha, width, height)
  }
}

function inWorker(alpha: Uint8Array, width: number, height: number): Promise<RegionData> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./regions.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<RegionData>) => {
      resolve(e.data)
      worker.terminate()
    }
    worker.onerror = (e) => {
      reject(e)
      worker.terminate()
    }
    // Copy, not transfer, so the fallback above still has the pixels if the worker fails.
    worker.postMessage({ alpha: alpha.slice(), width, height })
  })
}
