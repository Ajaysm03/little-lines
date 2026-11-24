/**
 * Zoom and pan for the page. The page is laid out to fit the stage at scale 1;
 * `x`/`y` move it and `scale` zooms it around the top-left corner.
 */
export interface View {
  scale: number
  x: number
  y: number
}

export interface Layout {
  stageW: number
  stageH: number
  /** Page size at scale 1, and its centred offset in the stage. */
  pageW: number
  pageH: number
  offsetX: number
  offsetY: number
}

export const MIN_SCALE = 1
export const MAX_SCALE = 6
export const FIT: View = { scale: 1, x: 0, y: 0 }

export function fitLayout(stageW: number, stageH: number, ratio: number, pad = 16): Layout {
  const availW = Math.max(1, stageW - pad * 2)
  const availH = Math.max(1, stageH - pad * 2)
  const pageW = Math.min(availW, availH * ratio)
  const pageH = pageW / ratio
  return { stageW, stageH, pageW, pageH, offsetX: (stageW - pageW) / 2, offsetY: (stageH - pageH) / 2 }
}

/** Keep the page covering the middle of the stage so it can't be lost off-screen. */
export function clampView(v: View, l: Layout): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale))
  if (scale <= 1.001) return { ...FIT }
  const w = l.pageW * scale
  const h = l.pageH * scale
  const minX = l.stageW / 2 - l.offsetX - w
  const maxX = l.stageW / 2 - l.offsetX
  const minY = l.stageH / 2 - l.offsetY - h
  const maxY = l.stageH / 2 - l.offsetY
  return { scale, x: Math.min(maxX, Math.max(minX, v.x)), y: Math.min(maxY, Math.max(minY, v.y)) }
}

/** Zoom by `factor` keeping the stage point (px, py) fixed under the finger or cursor. */
export function zoomAt(v: View, l: Layout, factor: number, px: number, py: number): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor))
  const lx = (px - l.offsetX - v.x) / v.scale
  const ly = (py - l.offsetY - v.y) / v.scale
  return clampView({ scale, x: px - l.offsetX - lx * scale, y: py - l.offsetY - ly * scale }, l)
}

export function panBy(v: View, l: Layout, dx: number, dy: number): View {
  return clampView({ ...v, x: v.x + dx, y: v.y + dy }, l)
}

export function cssTransform(v: View, l: Layout): string {
  return `translate(${l.offsetX + v.x}px, ${l.offsetY + v.y}px) scale(${v.scale})`
}
