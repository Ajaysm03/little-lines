import { mix, rgbToHex } from './colors'
import { buildFillPatch, hexToRgb, type FillPatch } from './fill'
import { History } from './history'
import { regionAt, type RegionData } from './regions'
import { texturePattern } from './textures'
import type { DrawTool, FillMode } from './tools'

/**
 * The coloring surface. Three canvases at full page resolution:
 *  - color:  the child's coloring (saved), shown under the line art
 *  - stroke: the stroke in progress, shown at the brush strength, merged on lift
 *  - backup: an off-screen copy of `color` before the current step, for undo patches
 * The line art itself is an <img> layered on top by the screen, so it is never painted over.
 */

export interface StrokeStyle {
  tool: DrawTool
  color: string
  /** Base line width in canvas pixels. */
  width: number
  /** 0–1. Ignored by the eraser and glitter. */
  opacity: number
  /** Width multiplier at lightest and firmest pressure. */
  pressure: [number, number]
  /** Keep the stroke inside the area where it started. */
  stayInLines: boolean
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

interface ActiveStroke {
  style: StrokeStyle
  pts: StrokePoint[]
  box: Box
  /** Pixels of the area the stroke must stay inside, when stay-in-the-lines is on. */
  clip: { canvas: HTMLCanvasElement; x: number; y: number; w: number; h: number } | null
  glitter: string[] | null
}

export interface SessionStats {
  strokes: number
  fills: number
  erases: number
  colors: Set<string>
  /** Tools used, e.g. crayon, glitter, fill. */
  tools: Set<string>
}

function emptyStats(): SessionStats {
  return { strokes: 0, fills: 0, erases: 0, colors: new Set(), tools: new Set() }
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
  private active: ActiveStroke | null = null

  /** Changed since the last save. */
  dirty = false
  stats: SessionStats = emptyStats()

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
    const s = this.stroke
    s.save()
    s.lineCap = 'round'
    s.lineJoin = 'round'
    const paint =
      style.tool === 'crayon' || style.tool === 'pencil' || style.tool === 'watercolor'
        ? texturePattern(s, style.tool, style.color)
        : style.tool === 'eraser'
          ? '#000'
          : style.color
    s.strokeStyle = s.fillStyle = paint

    const shown = style.tool === 'eraser' ? 0 : style.tool === 'glitter' ? 1 : style.opacity
    this.strokeCanvas.style.opacity = String(shown)

    this.active = {
      style,
      pts: [pt],
      box: { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
      clip: style.stayInLines ? this.clipFor(pt) : null,
      glitter: style.tool === 'glitter' ? glitterColors(style.color) : null,
    }
    const w = this.widthAt(pt)
    this.paint({ x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }, w, () => {
      if (style.tool === 'glitter') this.sprinkle(pt.x, pt.y, pt.x, pt.y, w)
      else {
        s.beginPath()
        s.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2)
        s.fill()
      }
    })
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
      const p1 = a.pts[n - 2]
      const p2 = a.pts[n - 1]
      const m = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
      this.segment(m, null, p2, this.widthAt(p2))
    }
    this.stroke.restore()
    this.active = null

    const box = this.clampBox(a.box)
    this.stats.tools.add(a.style.tool)
    if (a.style.tool === 'eraser') {
      this.stats.erases++
    } else {
      if (box) this.merge(a.style, box)
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
    this.stroke.restore()
    this.active = null
    const box = this.clampBox(a.box)
    if (!box) return
    const { x0, y0 } = box
    const w = box.x1 - x0
    const h = box.y1 - y0
    if (a.style.tool === 'eraser') this.color.putImageData(this.backup.getImageData(x0, y0, w, h), x0, y0)
    else this.stroke.clearRect(x0, y0, w, h)
  }

  /** Copies the finished stroke onto the coloring in the brush's own way. */
  private merge(style: StrokeStyle, box: Box) {
    const { x0, y0 } = box
    const w = box.x1 - x0
    const h = box.y1 - y0
    const c = this.color
    c.save()
    if (style.tool === 'watercolor') {
      // Paint glazes: layers multiply and the edges soften as it "dries".
      c.globalAlpha = style.opacity
      c.globalCompositeOperation = 'multiply'
      if ('filter' in c) c.filter = `blur(${Math.max(1, style.width / 28).toFixed(1)}px)`
    } else if (style.tool !== 'glitter') {
      c.globalAlpha = style.opacity
    }
    c.drawImage(this.strokeCanvas, x0, y0, w, h, x0, y0, w, h)
    c.restore()
    this.stroke.clearRect(x0, y0, w, h)
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
    const pts = this.active!.pts
    const n = pts.length
    const p1 = pts[n - 2]
    const p2 = pts[n - 1]
    const w = this.widthAt(p1)
    const end = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 }
    if (n === 2) this.segment(p1, null, end, w)
    else {
      const p0 = pts[n - 3]
      this.segment({ x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }, p1, end, w)
    }
  }

  private segment(from: { x: number; y: number }, ctrl: { x: number; y: number } | null, to: { x: number; y: number }, w: number) {
    const s = this.stroke
    const box = {
      x0: Math.min(from.x, to.x, ctrl?.x ?? Infinity),
      y0: Math.min(from.y, to.y, ctrl?.y ?? Infinity),
      x1: Math.max(from.x, to.x, ctrl?.x ?? -Infinity),
      y1: Math.max(from.y, to.y, ctrl?.y ?? -Infinity),
    }
    this.paint(box, w, () => {
      if (this.active!.style.tool === 'glitter') {
        const c = ctrl ?? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
        // Sample along the curve and sprinkle at each sample.
        const len = Math.hypot(c.x - from.x, c.y - from.y) + Math.hypot(to.x - c.x, to.y - c.y)
        const steps = Math.max(1, Math.ceil(len / Math.max(2, w / 4)))
        let px = from.x
        let py = from.y
        for (let i = 1; i <= steps; i++) {
          const t = i / steps
          const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * c.x + t * t * to.x
          const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * c.y + t * t * to.y
          this.sprinkle(px, py, x, y, w)
          px = x
          py = y
        }
        return
      }
      s.lineWidth = w
      s.beginPath()
      s.moveTo(from.x, from.y)
      if (ctrl) s.quadraticCurveTo(ctrl.x, ctrl.y, to.x, to.y)
      else s.lineTo(to.x, to.y)
      s.stroke()
    })
  }

  /**
   * Draws a piece of stroke onto the stroke canvas, keeps it inside the lines
   * if asked, and (for the eraser) applies it straight to the coloring.
   */
  private paint(raw: Box, w: number, draw: () => void) {
    const a = this.active!
    const pad = w / 2 + (a.style.tool === 'watercolor' ? 6 : 3)
    const seg = this.clampBox({ x0: raw.x0 - pad, y0: raw.y0 - pad, x1: raw.x1 + pad, y1: raw.y1 + pad })
    draw()
    if (!seg) return
    this.growBox(seg)
    if (a.clip) this.clipBox(seg, a.clip)
    if (a.style.tool === 'eraser') {
      const sw = seg.x1 - seg.x0
      const sh = seg.y1 - seg.y0
      this.color.save()
      this.color.globalCompositeOperation = 'destination-out'
      this.color.drawImage(this.strokeCanvas, seg.x0, seg.y0, sw, sh, seg.x0, seg.y0, sw, sh)
      this.color.restore()
      this.stroke.clearRect(seg.x0, seg.y0, sw, sh)
    }
  }

  private growBox(seg: Box) {
    const b = this.active!.box
    b.x0 = Math.min(b.x0, seg.x0)
    b.y0 = Math.min(b.y0, seg.y0)
    b.x1 = Math.max(b.x1, seg.x1)
    b.y1 = Math.max(b.y1, seg.y1)
  }

  /** Glitter: flecks of lighter and darker shades with the odd white sparkle. */
  private sprinkle(x0: number, y0: number, x1: number, y1: number, w: number) {
    const s = this.stroke
    const colors = this.active!.glitter!
    const flecks = Math.max(2, Math.round((w * Math.max(2, Math.hypot(x1 - x0, y1 - y0))) / 14))
    const unit = this.width / 1600
    for (let i = 0; i < flecks; i++) {
      const t = Math.random()
      const ang = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * (w / 2)
      const x = x0 + (x1 - x0) * t + Math.cos(ang) * r
      const y = y0 + (y1 - y0) * t + Math.sin(ang) * r
      if (Math.random() < 0.035) {
        // Four-point sparkle
        const arm = (3 + Math.random() * 4) * unit
        s.fillStyle = '#ffffff'
        s.fillRect(x - arm, y - 0.8 * unit, arm * 2, 1.6 * unit)
        s.fillRect(x - 0.8 * unit, y - arm, 1.6 * unit, arm * 2)
        continue
      }
      const size = (1.8 + Math.random() * 2.6) * unit
      s.fillStyle = colors[(Math.random() * colors.length) | 0]
      s.fillRect(x - size / 2, y - size / 2, size, size)
    }
  }

  // ── Stay in the lines ────────────────────────────────────────────────────

  /** Pixels of the area under the starting point (with the small bleed under its lines). */
  private clipFor(pt: StrokePoint): ActiveStroke['clip'] {
    if (!this.regions) return null
    const label = regionAt(this.regions, pt.x, pt.y, 10)
    const patch = buildFillPatch(this.regions, label, [0, 0, 0])
    if (!patch) return null
    return { canvas: patchCanvas(patch), x: patch.x, y: patch.y, w: patch.width, h: patch.height }
  }

  /** Keeps only the parts of the stroke canvas, inside `seg`, that fall within the clip area. */
  private clipBox(seg: Box, clip: NonNullable<ActiveStroke['clip']>) {
    const s = this.stroke
    s.save()
    s.globalCompositeOperation = 'destination-in'
    s.beginPath()
    s.rect(seg.x0, seg.y0, seg.x1 - seg.x0, seg.y1 - seg.y0)
    s.clip()
    s.drawImage(clip.canvas, clip.x, clip.y)
    s.restore()
    // Some browsers only composite where the mask image is drawn, so clear whatever lies outside it.
    const cx1 = clip.x + clip.w
    const cy1 = clip.y + clip.h
    if (seg.x0 < clip.x) s.clearRect(seg.x0, seg.y0, clip.x - seg.x0, seg.y1 - seg.y0)
    if (seg.x1 > cx1) s.clearRect(cx1, seg.y0, seg.x1 - cx1, seg.y1 - seg.y0)
    if (seg.y0 < clip.y) s.clearRect(seg.x0, seg.y0, seg.x1 - seg.x0, clip.y - seg.y0)
    if (seg.y1 > cy1) s.clearRect(seg.x0, cy1, seg.x1 - seg.x0, seg.y1 - cy1)
  }

  // ── Fill, pick, clear ────────────────────────────────────────────────────

  /** Fills the area under (x, y): solid, shaded light-to-full, or a rainbow. */
  fill(x: number, y: number, color: string, mode: FillMode = 'solid'): boolean {
    if (!this.regions) return false
    const label = regionAt(this.regions, x, y)
    const patch = buildFillPatch(this.regions, label, hexToRgb(color))
    if (!patch) return false
    const tmp = patchCanvas(patch)
    if (mode !== 'solid') {
      const t = tmp.getContext('2d')!
      t.globalCompositeOperation = 'source-in'
      const g =
        mode === 'shade'
          ? t.createLinearGradient(0, 0, 0, patch.height)
          : t.createLinearGradient(0, 0, patch.width, 0)
      if (mode === 'shade') {
        g.addColorStop(0, mix(color, '#ffffff', 0.6))
        g.addColorStop(1, color)
      } else {
        RAINBOW.forEach((c, i) => g.addColorStop(i / (RAINBOW.length - 1), c))
      }
      t.fillStyle = g
      t.fillRect(0, 0, patch.width, patch.height)
    }
    this.color.drawImage(tmp, patch.x, patch.y)
    tmp.width = tmp.height = 0
    this.stats.fills++
    this.stats.tools.add(mode === 'solid' ? 'fill' : `fill-${mode}`)
    this.stats.colors.add(mode === 'rainbow' ? 'rainbow' : color.toLowerCase())
    this.commit({ x0: patch.x, y0: patch.y, x1: patch.x + patch.width, y1: patch.y + patch.height })
    return true
  }

  /** The color already painted at (x, y); white where the page is still blank. */
  pick(x: number, y: number): string {
    const px = Math.round(Math.max(0, Math.min(this.width - 1, x)))
    const py = Math.round(Math.max(0, Math.min(this.height - 1, y)))
    const d = this.backup.getImageData(px, py, 1, 1).data
    if (d[3] < 40) return '#ffffff'
    // Un-premultiply over white paper for a true-looking color.
    const a = d[3] / 255
    return rgbToHex(d[0] * a + 255 * (1 - a), d[1] * a + 255 * (1 - a), d[2] * a + 255 * (1 - a))
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
    this.stats = emptyStats()
    return s
  }
}

const RAINBOW = ['#e0475b', '#f28a2e', '#f2c230', '#3ba55c', '#3d8be8', '#8559d9']

function glitterColors(color: string): string[] {
  return [
    mix(color, '#ffffff', 0.55),
    mix(color, '#ffffff', 0.3),
    color,
    color,
    mix(color, '#000000', 0.2),
    mix(color, '#000000', 0.38),
    mix(color, '#ffe9a8', 0.5),
  ]
}

function patchCanvas(patch: FillPatch): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = patch.width
  c.height = patch.height
  c.getContext('2d')!.putImageData(new ImageData(patch.data, patch.width, patch.height), 0, 0)
  return c
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
