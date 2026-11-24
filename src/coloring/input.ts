import type { StrokePoint } from './engine'
import { panBy, zoomAt, type Layout, type View } from './viewport'

/**
 * Turns pointer events on the stage into drawing, filling, zooming and panning.
 *
 *  - Apple Pencil / stylus and mouse draw.
 *  - One finger draws, unless "pencil only" is on (then fingers move the page).
 *  - Two fingers pinch to zoom and drag to pan. A second finger landing right
 *    after the first turns a just-started stroke into a pinch (the stroke is dropped).
 *  - Two-finger tap undoes, three-finger tap redoes.
 *  - Trackpad/mouse wheel pans; pinch on a trackpad (or ctrl/⌘ + wheel) zooms.
 *  - Middle mouse button, or holding space, drags the page.
 */
export interface InputCallbacks {
  ready(): boolean
  tool(): 'pencil' | 'brush' | 'fill' | 'eraser'
  penOnly(): boolean
  spaceHeld(): boolean
  /** Client coordinates → canvas pixels. */
  toCanvas(clientX: number, clientY: number): { x: number; y: number }
  getView(): View
  getLayout(): Layout | null
  setView(view: View): void
  onPenDetected(): void
  onStrokeStart(pt: StrokePoint): void
  onStrokeMove(pts: StrokePoint[]): void
  onStrokeEnd(): void
  onStrokeCancel(): void
  onFill(pt: StrokePoint): void
  onUndo(): void
  onRedo(): void
}

interface Ptr {
  type: string
  x: number
  y: number
  startX: number
  startY: number
}

interface Gesture {
  startT: number
  maxPointers: number
  moved: number
  ids: number[]
  startDist: number
  startMid: { x: number; y: number }
  startView: View
}

/** A second finger within this window converts a fresh stroke into a pinch. */
const PINCH_GRACE_MS = 250
const TAP_MS = 320
const TAP_SLOP = 12

export class StageInput {
  private readonly el: HTMLElement
  private readonly cb: InputCallbacks
  private readonly ptrs = new Map<number, Ptr>()
  private mode: 'idle' | 'draw' | 'fill' | 'gesture' = 'idle'
  private primary = -1
  private primaryType = ''
  private primaryStart = 0
  private gesture: Gesture | null = null

  constructor(el: HTMLElement, cb: InputCallbacks) {
    this.el = el
    this.cb = cb
    el.addEventListener('pointerdown', this.down)
    el.addEventListener('pointermove', this.move)
    el.addEventListener('pointerup', this.up)
    el.addEventListener('pointercancel', this.cancel)
    el.addEventListener('wheel', this.wheel, { passive: false })
    el.addEventListener('contextmenu', this.prevent)
    // iOS Safari: stop the page from scrolling or zooming under a finger.
    el.addEventListener('touchstart', this.preventTouch, { passive: false })
    el.addEventListener('touchmove', this.preventTouch, { passive: false })
  }

  destroy() {
    const el = this.el
    el.removeEventListener('pointerdown', this.down)
    el.removeEventListener('pointermove', this.move)
    el.removeEventListener('pointerup', this.up)
    el.removeEventListener('pointercancel', this.cancel)
    el.removeEventListener('wheel', this.wheel)
    el.removeEventListener('contextmenu', this.prevent)
    el.removeEventListener('touchstart', this.preventTouch)
    el.removeEventListener('touchmove', this.preventTouch)
  }

  private prevent = (e: Event) => e.preventDefault()
  private preventTouch = (e: TouchEvent) => {
    if (e.target instanceof Element && e.target.closest('[data-stage-ui]')) return
    e.preventDefault()
  }

  private local(clientX: number, clientY: number) {
    const r = this.el.getBoundingClientRect()
    return { x: clientX - r.left, y: clientY - r.top }
  }

  private point(e: PointerEvent): StrokePoint {
    const { x, y } = this.cb.toCanvas(e.clientX, e.clientY)
    let pressure = -1
    if (e.pointerType === 'pen') pressure = e.pressure > 0 ? e.pressure : 0.5
    return { x, y, pressure }
  }

  private touchIds() {
    return [...this.ptrs.entries()].filter(([, p]) => p.type === 'touch').map(([id]) => id)
  }

  private down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return
    // Buttons floating over the page (zoom controls) are not part of the drawing surface.
    if (e.target instanceof Element && e.target.closest('[data-stage-ui]')) return
    e.preventDefault()
    try {
      this.el.setPointerCapture(e.pointerId)
    } catch {
      /* pointer already gone */
    }
    if (e.pointerType === 'pen') this.cb.onPenDetected()
    const at = this.local(e.clientX, e.clientY)
    this.ptrs.set(e.pointerId, { type: e.pointerType, x: at.x, y: at.y, startX: at.x, startY: at.y })

    if (e.pointerType === 'touch') {
      if (this.mode === 'draw' && this.primaryType === 'touch') {
        if (performance.now() - this.primaryStart < PINCH_GRACE_MS) {
          this.cb.onStrokeCancel()
          this.startGesture(this.touchIds())
        }
        return
      }
      if (this.mode === 'fill' && this.primaryType === 'touch') return this.startGesture(this.touchIds())
      if (this.mode === 'gesture') return this.addToGesture(e.pointerId)
      if (this.mode === 'idle') {
        if (this.cb.penOnly() || this.touchIds().length >= 2) return this.startGesture(this.touchIds())
        this.beginPrimary(e)
      }
      return
    }

    // Pen or mouse. A pen always wins over a finger stroke (a resting palm).
    if (this.mode === 'draw' && this.primaryType === 'touch' && e.pointerType === 'pen') {
      this.cb.onStrokeCancel()
      this.mode = 'idle'
    }
    if (this.mode !== 'idle') return
    if (e.pointerType === 'mouse' && (e.button === 1 || this.cb.spaceHeld())) return this.startGesture([e.pointerId])
    this.beginPrimary(e)
  }

  private beginPrimary(e: PointerEvent) {
    if (!this.cb.ready()) return
    this.primary = e.pointerId
    this.primaryType = e.pointerType
    this.primaryStart = performance.now()
    if (this.cb.tool() === 'fill') {
      this.mode = 'fill'
    } else {
      this.mode = 'draw'
      this.cb.onStrokeStart(this.point(e))
    }
  }

  private move = (e: PointerEvent) => {
    const p = this.ptrs.get(e.pointerId)
    if (!p) return // hover, or a pointer we never saw go down
    const at = this.local(e.clientX, e.clientY)
    p.x = at.x
    p.y = at.y
    if (this.mode === 'draw' && e.pointerId === this.primary) {
      const coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : []
      this.cb.onStrokeMove((coalesced.length ? coalesced : [e]).map((c) => this.point(c)))
    } else if (this.mode === 'gesture') {
      this.updateGesture()
    }
  }

  private up = (e: PointerEvent) => this.release(e, false)
  private cancel = (e: PointerEvent) => this.release(e, true)

  private release(e: PointerEvent, cancelled: boolean) {
    const p = this.ptrs.get(e.pointerId)
    if (!p) return
    this.ptrs.delete(e.pointerId)

    if (this.mode === 'draw' && e.pointerId === this.primary) {
      this.cb.onStrokeEnd()
      this.mode = 'idle'
    } else if (this.mode === 'fill' && e.pointerId === this.primary) {
      if (!cancelled && Math.hypot(p.x - p.startX, p.y - p.startY) < TAP_SLOP) this.cb.onFill(this.point(e))
      this.mode = 'idle'
    } else if (this.mode === 'gesture' && this.gesture) {
      const g = this.gesture
      g.ids = g.ids.filter((id) => id !== e.pointerId)
      if (g.ids.length === 0) {
        const tapped = !cancelled && performance.now() - g.startT < TAP_MS && g.moved < TAP_SLOP
        if (tapped && g.maxPointers === 2) this.cb.onUndo()
        else if (tapped && g.maxPointers >= 3) this.cb.onRedo()
        this.gesture = null
        this.mode = 'idle'
      } else {
        this.rebase()
      }
    }
  }

  // ── Pinch / pan ─────────────────────────────────────────────────────────

  private startGesture(ids: number[]) {
    this.mode = 'gesture'
    this.gesture = {
      startT: performance.now(),
      maxPointers: ids.length,
      moved: 0,
      ids: [...ids],
      startDist: 1,
      startMid: { x: 0, y: 0 },
      startView: this.cb.getView(),
    }
    this.rebase()
  }

  private addToGesture(id: number) {
    const g = this.gesture
    if (!g || g.ids.includes(id)) return
    g.ids.push(id)
    g.maxPointers = Math.max(g.maxPointers, g.ids.length)
    this.rebase()
  }

  /** Re-anchor after fingers are added or lifted, so the page doesn't jump. */
  private rebase() {
    const g = this.gesture!
    const pts = g.ids.map((id) => this.ptrs.get(id)).filter((p): p is Ptr => Boolean(p))
    if (pts.length === 0) return
    g.startView = this.cb.getView()
    g.startMid = mid(pts)
    g.startDist = pts.length >= 2 ? Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)) : 1
  }

  private updateGesture() {
    const g = this.gesture
    const layout = this.cb.getLayout()
    if (!g || !layout) return
    const pts = g.ids.map((id) => this.ptrs.get(id)).filter((p): p is Ptr => Boolean(p))
    if (pts.length === 0) return
    const m = mid(pts)
    let view = g.startView
    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      view = zoomAt(view, layout, dist / g.startDist, g.startMid.x, g.startMid.y)
    }
    view = panBy(view, layout, m.x - g.startMid.x, m.y - g.startMid.y)
    for (const p of pts) g.moved = Math.max(g.moved, Math.hypot(p.x - p.startX, p.y - p.startY))
    this.cb.setView(view)
  }

  private wheel = (e: WheelEvent) => {
    e.preventDefault()
    const layout = this.cb.getLayout()
    if (!layout) return
    const at = this.local(e.clientX, e.clientY)
    const unit = e.deltaMode === 1 ? 16 : 1
    if (e.ctrlKey || e.metaKey) {
      this.cb.setView(zoomAt(this.cb.getView(), layout, Math.exp((-e.deltaY * unit) / 120), at.x, at.y))
    } else {
      this.cb.setView(panBy(this.cb.getView(), layout, -e.deltaX * unit, -e.deltaY * unit))
    }
  }
}

function mid(pts: Ptr[]) {
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length
  return { x, y }
}
