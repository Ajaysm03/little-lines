import { buildFillPatch, hexToRgb } from './fill'
import { History } from './history'
import { regionAt, type RegionData } from './regions'
import type { DrawTool } from './tools'

/**
 * The coloring surface. Three canvases at full page resolution:
 *  - color:  the child's coloring (saved), shown under the line art
 *  - stroke: the stroke in progress, shown at the brush opacity, merged on lift
 *  - backup: an off-screen copy of `color` before the current step, for undo patches
 * The line art itself is an <img> layered on top by the screen, so it is never painted over.
 */

export interface StrokeStyle {
  tool: DrawTool
  color: string
  /** Base line width in canvas pixels. */
  width: number
  /** 0–1. Ignored by the eraser. */
  opacity: number
  /** Width multiplier at lightest and firmest pressure. */
  pressure: [number, number]
}

export interface StrokePoint {
  x: number
  y: number
  /** 0–1 from a pen; -1 when the input has no real pressure (finger, mouse). */
  pressure: number
}

interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface SessionStats {
  strokes: number
  fills: number
  erases: number
  colors: Set<string>
}

export class ColoringEngine {
  readonly width: number
  readonly height: number
  private readonly colorCanvas: HTMLCanvasElement
  private readonly strokeCanvas: HTMLCanvasElement
  private readonly color: CanvasRenderingContext2D
  private readonly stroke: CanvasRenderingContext2D
  private readonly backup: CanvasRenderingContext2D
  private readonly history = new History()
  private readonly listeners = new Set<() => void>()
  private regions: RegionData | null = null
  private active: { style: StrokeStyle; pts: StrokePoint[]; box: Box; target: CanvasRenderingContext2D } | null = null

  /** Changed since the last save. */
  dirty = false
  stats: SessionStats = { strokes: 0, fills: 0, erases: 0, colors: new Set() }

  constructor(colorCanvas: HTMLCanvasElement, strokeCanvas: HTMLCanvasElement) {
    this.colorCanvas = colorCanvas
    this.strokeCanvas = strokeCanvas
    this.width = colorCanvas.width
    this.height = colorCanvas.height
    this.color = colorCanvas.getContext('2d')!
    this.stroke = strokeCanvas.getContext('2d', { desynchronized: true })!
    const backup = document.createElement('canvas')
    backup.width = this.width
    backup.height = this.height
    this.backup = backup.getContext('2d', { willReadFrequently: true })!
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    for (const fn of this.listeners) fn()
  }

  setRegions(map: RegionData) {
    this.regions = map
  }
  get hasRegions() {
    return this.regions !== null
  }
  get canUndo() {
    return this.history.canUndo
  }
  get canRedo() {
    return this.history.canRedo
  }
  get drawing() {
    return this.active !== null
  }

  // ── Strokes ──────────────────────────────────────────────────────────────

  beginStroke(style: StrokeStyle, pt: StrokePoint) {
    if (this.active) this.endStroke()
    const eraser = style.tool === 'eraser'
    const target = eraser ? this.color : this.stroke
    target.save()
    target.lineCap = 'round'
    target.lineJoin = 'round'
    target.strokeStyle = target.fillStyle = eraser ? '#000' : style.color
    if (eraser) target.globalCompositeOperation = 'destination-out'
    this.strokeCanvas.style.opacity = eraser ? '1' : String(style.opacity)
    this.active = { style, pts: [pt], box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, target }

    const w = this.widthAt(pt)
    target.beginPath()
    target.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2)
    target.fill()
    this.grow(pt, w)
  }

  extendStroke(points: StrokePoint[]) {
    const a = this.active
    if (!a) return
    for (const p of points) {
      const last = a.pts[a.pts.length - 1]
      if (Math.abs(p.x - last.x) < 0.5 && Math.abs(p.y - last.y) < 0.5) continue
      a.pts.push(p)
      this.drawLatest()
    }
  }

  /** Merges the stroke into the coloring. Returns false if there was no stroke. */
  endStroke(): boolean {
    const a = this.active
    if (!a) return false
    const n = a.pts.length
    if (n >= 2) {
      // Finish from the last midpoint to the final point.
      const p1 = a.pts[n - 2]
      const p2 = a.pts[n - 1]
      const t = a.target
      t.lineWidth = this.widthAt(p2)
      t.beginPath()
      t.moveTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
      t.lineTo(p2.x, p2.y)
      t.stroke()
    }
    a.target.restore()
    this.active = null

    const box = this.clampBox(a.box)
    if (a.style.tool === 'eraser') {
      this.stats.erases++
    } else {
      if (box) {
        this.color.save()
        this.color.globalAlpha = a.style.opacity
        this.color.drawImage(this.strokeCanvas, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0, box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
        this.color.restore()
        this.stroke.clearRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0)
      }
      this.stats.strokes++
      this.stats.colors.add(a.style.color.toLowerCase())
    }
    if (box) this.commit(box)
    return true
  }

  /** Throws the stroke away, e.g. when a second finger turns it into a pinch. */
  cancelStroke() {
    const a = this.active
    if (!a) return
    a.target.restore()
    this.active = null
    const box = this.clampBox(a.box)
    if (!box) return
    const { x0, y0 } = box
    const w = box.x1 - x0
    const h = box.y1 - y0
    if (a.style.tool === 'eraser') this.color.putImageData(this.backup.getImageData(x0, y0, w, h), x0, y0)
    else this.stroke.clearRect(x0, y0, w, h)
  }

  private widthAt(p: StrokePoint): number {
    const s = this.active?.style
    if (!s) return 1
    if (p.pressure < 0) return s.width
    const [min, max] = s.pressure
    return Math.max(0.75, s.width * (min + (max - min) * Math.pow(p.pressure, 0.85)))
  }

  /** Smooth curve through midpoints: each new point adds one quadratic segment. */
  private drawLatest() {
    const a = this.active!
    const pts = a.pts
    const n = pts.length
    const t = a.target
    const p1 = pts[n - 2]
    const p2 = pts[n - 1]
    const w = this.widthAt(p1)
    t.lineWidth = w
    t.beginPath()
    if (n === 2) {
      t.moveTo(p1.x, p1.y)
      t.lineTo((p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
    } else {
      const p0 = pts[n - 3]
      t.moveTo((p0.x + p1.x) / 2, (p0.y + p1.y) / 2)
      t.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2)
    }
    t.stroke()
    this.grow(p2, Math.max(w, this.widthAt(p2)))
  }

  private grow(p: StrokePoint, w: number) {
    const b = this.active!.box
    const r = w / 2 + 2
    b.x0 = Math.min(b.x0, p.x - r)
    b.y0 = Math.min(b.y0, p.y - r)
    b.x1 = Math.max(b.x1, p.x + r)
    b.y1 = Math.max(b.y1, p.y + r)
  }

  // ── Fill, clear ──────────────────────────────────────────────────────────

  /** Bucket fill of the area under (x, y). Returns false if nothing could be filled. */
  fill(x: number, y: number, color: string): boolean {
    if (!this.regions) return false
    const label = regionAt(this.regions, x, y)
    const patch = buildFillPatch(this.regions, label, hexToRgb(color))
    if (!patch) return false
    const tmp = document.createElement('canvas')
    tmp.width = patch.width
    tmp.height = patch.height
    tmp.getContext('2d')!.putImageData(new ImageData(patch.data, patch.width, patch.height), 0, 0)
    this.color.drawImage(tmp, patch.x, patch.y)
    tmp.width = tmp.height = 0
    this.stats.fills++
    this.stats.colors.add(color.toLowerCase())
    this.commit({ x0: patch.x, y0: patch.y, x1: patch.x + patch.width, y1: patch.y + patch.height })
    return true
  }

  clear() {
    this.color.clearRect(0, 0, this.width, this.height)
    this.commit({ x0: 0, y0: 0, x1: this.width, y1: this.height })
  }

  // ── History ──────────────────────────────────────────────────────────────

  private commit(box: Box) {
    const x = Math.floor(box.x0)
    const y = Math.floor(box.y0)
    const w = Math.ceil(box.x1) - x
    const h = Math.ceil(box.y1) - y
    if (w <= 0 || h <= 0) return
    const before = this.backup.getImageData(x, y, w, h)
    const after = this.color.getImageData(x, y, w, h)
    this.history.push({ x, y, before, after })
    this.backup.putImageData(after, x, y)
    this.dirty = true
    this.emit()
  }

  undo(): boolean {
    if (this.active) this.cancelStroke()
    const p = this.history.undo()
    if (!p) return false
    this.color.putImageData(p.before, p.x, p.y)
    this.backup.putImageData(p.before, p.x, p.y)
    this.dirty = true
    this.emit()
    return true
  }

  redo(): boolean {
    const p = this.history.redo()
    if (!p) return false
    this.color.putImageData(p.after, p.x, p.y)
    this.backup.putImageData(p.after, p.x, p.y)
    this.dirty = true
    this.emit()
    return true
  }

  private clampBox(b: Box): Box | null {
    const x0 = Math.max(0, Math.floor(b.x0))
    const y0 = Math.max(0, Math.floor(b.y0))
    const x1 = Math.min(this.width, Math.ceil(b.x1))
    const y1 = Math.min(this.height, Math.ceil(b.y1))
    return x1 > x0 && y1 > y0 ? { x0, y0, x1, y1 } : null
  }

  // ── Load, save, progress ─────────────────────────────────────────────────

  async load(blob: Blob) {
    const img = await decode(blob)
    this.color.clearRect(0, 0, this.width, this.height)
    this.color.drawImage(img, 0, 0, this.width, this.height)
    this.backup.clearRect(0, 0, this.width, this.height)
    this.backup.drawImage(img, 0, 0, this.width, this.height)
    if ('close' in img) img.close()
    this.history.clear()
    this.dirty = false
    this.emit()
  }

  exportLayer(): Promise<Blob> {
    return toBlob(this.colorCanvas)
  }

  /** The coloring scaled down, transparent where uncolored, for the flip book and page tiles. */
  exportThumb(maxWidth = 800): Promise<Blob> {
    const scale = Math.min(1, maxWidth / this.width)
    const c = document.createElement('canvas')
    c.width = Math.round(this.width * scale)
    c.height = Math.round(this.height * scale)
    const ctx = c.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(this.colorCanvas, 0, 0, c.width, c.height)
    return toBlob(c).finally(() => {
      c.width = c.height = 0
    })
  }

  /** Share (0–1) of the page's colorable area that has color on it. */
  progress(): number {
    const grid = this.regions?.grid
    if (!grid || grid.colorable === 0) return 0
    const c = document.createElement('canvas')
    c.width = grid.width
    c.height = grid.height
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(this.colorCanvas, 0, 0, grid.width, grid.height)
    const px = ctx.getImageData(0, 0, grid.width, grid.height).data
    let colored = 0
    for (let i = 0; i < grid.mask.length; i++) if (grid.mask[i] && px[i * 4 + 3] > 24) colored++
    c.width = c.height = 0
    return colored / grid.colorable
  }

  /** Resets the per-save counters after their numbers have been logged. */
  takeStats(): SessionStats {
    const s = this.stats
    this.stats = { strokes: 0, fills: 0, erases: 0, colors: new Set() }
    return s
  }
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the page'))), 'image/png'),
  )
}

async function decode(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob)
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}
