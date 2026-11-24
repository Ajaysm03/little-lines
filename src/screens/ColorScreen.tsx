import { ArrowLeft, Check, CloudOff, Hand, Maximize, Minus, PenLine, Plus, Redo2, Trash2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ColoringEngine, type StrokeStyle } from '../coloring/engine'
import { StageInput } from '../coloring/input'
import { loadRegions } from '../coloring/load-regions'
import { TOOLS, toolWidth, type DrawTool, type ToolId } from '../coloring/tools'
import { clampView, cssTransform, FIT, fitLayout, zoomAt, type Layout, type View } from '../coloring/viewport'
import { OpacitySlider, Palette, SizePicker, ToolPicker } from '../components/coloring-ui'
import { Dialog } from '../components/Dialog'
import { Button, Spinner, cn } from '../components/ui'
import { getBook, type Book, type BookPage } from '../content/books'
import { getArtwork, saveArtwork } from '../data/artworks'
import { logEvent } from '../data/events'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'
import { NotFound } from './NotFound'

const SAVE_DELAY_MS = 1200
/** Gaps longer than this between strokes don't count as time spent coloring. */
const IDLE_GAP_MS = 15_000

export function ColorScreen() {
  const { bookId, pageId } = useParams()
  const book = bookId ? getBook(bookId) : undefined
  const index = book?.pages.findIndex((p) => p.id === pageId) ?? -1
  const page = book && index >= 0 ? book.pages[index] : undefined
  if (!book || !page || page.kind !== 'line-art') return <NotFound />
  return <Editor key={`${book.id}:${page.id}`} book={book} page={page} index={index} />
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

function Editor({ book, page, index }: { book: Book; page: BookPage; index: number }) {
  const navigate = useNavigate()
  const accountId = useSession((s) => s.account?.id) ?? ''
  const profileId = useSession((s) => s.profileId) ?? ''
  const penOnly = usePrefs((s) => s.penOnly)
  const setPenOnly = usePrefs((s) => s.setPenOnly)
  const recent = usePrefs((s) => s.recentColors[profileId]) ?? []
  const addRecentColor = usePrefs((s) => s.addRecentColor)
  const W = book.pageSize.width
  const H = book.pageSize.height

  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const colorRef = useRef<HTMLCanvasElement>(null)
  const strokeRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ColoringEngine | null>(null)

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tool, setTool] = useState<ToolId>('brush')
  const [color, setColor] = useState(book.theme.palette[0])
  const [sizes, setSizes] = useState<Record<DrawTool, number>>({
    pencil: TOOLS.pencil.defaultSize,
    brush: TOOLS.brush.defaultSize,
    eraser: TOOLS.eraser.defaultSize,
  })
  const [opacity, setOpacity] = useState(1)
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [zoomed, setZoomed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)

  // Input handlers read the latest choices through refs so listeners attach once.
  const live = useRef({ tool, color, sizes, opacity, ready })
  live.current = { tool, color, sizes, opacity, ready }
  const viewRef = useRef<View>(FIT)
  const layoutRef = useRef<Layout | null>(null)
  const spaceRef = useRef(false)
  const activity = useRef({ last: 0, ms: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saving = useRef<Promise<void> | null>(null)

  // ── View (zoom / pan) ────────────────────────────────────────────────────
  const applyView = useCallback((v: View) => {
    const layout = layoutRef.current
    const sheet = sheetRef.current
    if (!layout || !sheet) return
    const next = clampView(v, layout)
    viewRef.current = next
    sheet.style.width = `${layout.pageW}px`
    sheet.style.height = `${layout.pageH}px`
    sheet.style.transform = cssTransform(next, layout)
    setZoomed(next.scale > 1.01)
  }, [])

  /** Zoom around the middle of the stage (buttons and keyboard). */
  const zoomBy = useCallback(
    (factor: number) => {
      const l = layoutRef.current
      if (l) applyView(zoomAt(viewRef.current, l, factor, l.stageW / 2, l.stageH / 2))
    },
    [applyView],
  )

  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const ro = new ResizeObserver(() => {
      layoutRef.current = fitLayout(stage.clientWidth, stage.clientHeight, W / H, 16)
      applyView(viewRef.current)
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [W, H, applyView])

  // ── Saving ───────────────────────────────────────────────────────────────
  const save = useCallback(async (): Promise<void> => {
    clearTimeout(saveTimer.current)
    if (saving.current) await saving.current
    const engine = engineRef.current
    if (!engine || !engine.dirty || !profileId) return
    engine.dirty = false
    setSaveState('saving')
    const run = (async () => {
      try {
        const [colorLayer, thumb] = await Promise.all([engine.exportLayer(), engine.exportThumb()])
        const progress = engine.progress()
        await saveArtwork({ profileId, bookId: book.id, pageId: page.id, colorLayer, thumb, progress })
        const stats = engine.takeStats()
        const ms = Math.round(activity.current.ms)
        activity.current.ms = 0
        void logEvent({
          accountId,
          profileId,
          type: 'coloring',
          bookId: book.id,
          pageId: page.id,
          data: { ms, strokes: stats.strokes, fills: stats.fills, erases: stats.erases, colors: [...stats.colors], progress },
        })
        setSaveState(engine.dirty ? 'pending' : 'saved')
      } catch {
        engine.dirty = true
        setSaveState('error')
      }
    })()
    saving.current = run
    await run
    saving.current = null
  }, [accountId, profileId, book.id, page.id])

  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current)
    setSaveState('pending')
    saveTimer.current = setTimeout(() => void save(), SAVE_DELAY_MS)
  }, [save])

  // ── Engine + page loading ────────────────────────────────────────────────
  useEffect(() => {
    const colorCanvas = colorRef.current
    const strokeCanvas = strokeRef.current
    if (!colorCanvas || !strokeCanvas) return
    let cancelled = false
    const engine = new ColoringEngine(colorCanvas, strokeCanvas)
    engineRef.current = engine
    const unsubscribe = engine.subscribe(() => {
      setHist({ canUndo: engine.canUndo, canRedo: engine.canRedo })
      if (engine.dirty) scheduleSave()
    })

    Promise.all([loadRegions(page.image, W, H), profileId ? getArtwork(profileId, book.id, page.id) : undefined])
      .then(async ([regions, artwork]) => {
        if (cancelled) return
        engine.setRegions(regions)
        if (artwork?.colorLayer) await engine.load(artwork.colorLayer)
        if (cancelled) return
        setReady(true)
        if (accountId && profileId)
          void logEvent({ accountId, profileId, type: 'color_open', bookId: book.id, pageId: page.id, data: { pageIndex: index } })
      })
      .catch(() => !cancelled && setLoadError(true))

    const onHide = () => document.visibilityState === 'hidden' && void save()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onHide)
      unsubscribe()
      void save() // keep anything not yet saved when leaving
    }
  }, [W, H, page.image, page.id, book.id, profileId, accountId, index, save, scheduleSave])

  // ── Input ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const noteActivity = () => {
      const now = performance.now()
      const a = activity.current
      if (a.last && now - a.last < IDLE_GAP_MS) a.ms += now - a.last
      a.last = now
    }
    const style = (): StrokeStyle => {
      const { tool: t, color: c, sizes: s, opacity: o } = live.current
      const drawTool = (t === 'fill' ? 'brush' : t) as DrawTool
      return {
        tool: drawTool,
        color: c,
        width: toolWidth(drawTool, s[drawTool], W),
        opacity: drawTool === 'eraser' ? 1 : o,
        pressure: TOOLS[drawTool].pressure,
      }
    }
    const input = new StageInput(stage, {
      ready: () => live.current.ready && engineRef.current !== null,
      tool: () => live.current.tool,
      penOnly: () => usePrefs.getState().penOnly,
      spaceHeld: () => spaceRef.current,
      toCanvas: (cx, cy) => {
        const r = sheetRef.current!.getBoundingClientRect()
        return { x: ((cx - r.left) / r.width) * W, y: ((cy - r.top) / r.height) * H }
      },
      getView: () => viewRef.current,
      getLayout: () => layoutRef.current,
      setView: applyView,
      onPenDetected: () => {
        const prefs = usePrefs.getState()
        if (prefs.penSeen) return
        prefs.markPenSeen()
        prefs.setPenOnly(true)
        setToast('Apple Pencil found. Now only the pencil draws, and fingers move and zoom the page.')
      },
      onStrokeStart: (pt) => {
        noteActivity()
        engineRef.current?.beginStroke(style(), pt)
      },
      onStrokeMove: (pts) => engineRef.current?.extendStroke(pts),
      onStrokeEnd: () => {
        noteActivity()
        const t = live.current.tool
        if (engineRef.current?.endStroke() && t !== 'eraser') addRecentColor(profileId, live.current.color)
      },
      onStrokeCancel: () => engineRef.current?.cancelStroke(),
      onFill: (pt) => {
        noteActivity()
        if (engineRef.current?.fill(pt.x, pt.y, live.current.color)) addRecentColor(profileId, live.current.color)
      },
      onUndo: () => engineRef.current?.undo(),
      onRedo: () => engineRef.current?.redo(),
    })
    return () => input.destroy()
  }, [W, H, applyView, addRecentColor, profileId])

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) engineRef.current?.redo()
        else engineRef.current?.undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        engineRef.current?.redo()
      } else if (!mod && e.key === ' ') {
        spaceRef.current = true
        e.preventDefault()
      } else if (!mod && k === '0') applyView(FIT)
      else if (!mod && (k === '=' || k === '+')) zoomBy(1.25)
      else if (!mod && k === '-') zoomBy(0.8)
      else if (!mod && (k === '[' || k === ']')) {
        const t = live.current.tool
        if (t === 'fill') return
        setSizes((s) => ({ ...s, [t]: Math.max(0, Math.min(TOOLS[t].sizes.length - 1, s[t] + (k === ']' ? 1 : -1))) }))
      } else if (!mod) {
        const match = (Object.keys(TOOLS) as ToolId[]).find((id) => TOOLS[id].shortcut === k)
        if (match) setTool(match)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') spaceRef.current = false
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [applyView, zoomBy])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  async function leave() {
    setLeaving(true)
    await save()
    navigate(`/books/${book.id}/read?page=${index}`)
  }

  const drawTool: DrawTool | null = tool === 'fill' ? null : tool
  const sizeControl = drawTool ? (
    <SizePicker
      sizes={TOOLS[drawTool].sizes}
      value={sizes[drawTool]}
      onChange={(i) => setSizes((s) => ({ ...s, [drawTool]: i }))}
      direction="column"
      color={drawTool === 'eraser' ? 'var(--color-graphite)' : color}
    />
  ) : null
  const opacityControl =
    tool === 'pencil' || tool === 'brush' ? <OpacitySlider value={opacity} onChange={setOpacity} color={color} /> : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-frost select-none">
      {/* Top bar */}
      <header className="flex shrink-0 items-center gap-1.5 border-b-2 border-mist/70 bg-paper px-2 py-2 sm:gap-2 sm:px-3">
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 font-semibold text-ink hover:bg-frost"
        >
          <ArrowLeft className="size-5" /> <span className="hidden sm:inline">Book</span>
        </button>
        <div className="min-w-0 flex-1 px-1">
          <h1 className="truncate font-display text-[1.125rem] font-bold text-ink-deep sm:text-[1.25rem]">{page.title}</h1>
          <SaveStatus state={saveState} />
        </div>
        <IconButton label="Undo" onClick={() => engineRef.current?.undo()} disabled={!hist.canUndo}>
          <Undo2 className="size-6" />
        </IconButton>
        <IconButton label="Redo" onClick={() => engineRef.current?.redo()} disabled={!hist.canRedo}>
          <Redo2 className="size-6" />
        </IconButton>
        <button
          type="button"
          onClick={() => setPenOnly(!penOnly)}
          aria-pressed={penOnly}
          title={penOnly ? 'Only the pencil draws. Fingers move the page.' : 'Fingers and pencil both draw.'}
          className={cn(
            'inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-semibold transition-colors',
            penOnly ? 'bg-ink text-white' : 'text-graphite hover:bg-frost',
          )}
        >
          {penOnly ? <PenLine className="size-5" /> : <Hand className="size-5" />}
          <span className="hidden md:inline">{penOnly ? 'Pencil only' : 'Finger draws'}</span>
        </button>
        <IconButton label="Clear page" onClick={() => setConfirmClear(true)} disabled={!ready} className="hidden sm:grid">
          <Trash2 className="size-5" />
        </IconButton>
        <Button onClick={leave} busy={leaving} className="ml-1 px-4 sm:px-5" aria-label="Done">
          <Check className="size-5" /> <span className="hidden sm:inline">Done</span>
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tools (tablet and up) */}
        <aside className="hidden shrink-0 flex-col items-center gap-3 overflow-y-auto border-r-2 border-mist/70 bg-paper px-2 py-3 md:flex">
          <ToolPicker tool={tool} color={color} onChange={setTool} direction="column" />
          {sizeControl ? <span aria-hidden className="h-0.5 w-10 rounded bg-mist" /> : null}
          {sizeControl}
        </aside>

        {/* The page */}
        <div
          ref={stageRef}
          className="relative min-w-0 flex-1 touch-none overflow-hidden [-webkit-touch-callout:none]"
          style={{ cursor: tool === 'fill' ? 'cell' : 'crosshair' }}
        >
          <div ref={sheetRef} className="absolute top-0 left-0 origin-top-left bg-[#fffefb] shadow-paper will-change-transform">
            <canvas ref={colorRef} width={W} height={H} className="absolute inset-0 size-full" />
            <canvas ref={strokeRef} width={W} height={H} className="absolute inset-0 size-full" />
            <img src={page.image} alt={page.title} draggable={false} className="pointer-events-none absolute inset-0 size-full" />
          </div>
          <div data-stage-ui className="absolute right-3 bottom-3 flex flex-col gap-1 rounded-full bg-paper/95 p-1 shadow-lift">
            <IconButton label="Zoom in" onClick={() => zoomBy(1.4)}>
              <Plus className="size-5" />
            </IconButton>
            <IconButton label="Zoom out" onClick={() => zoomBy(1 / 1.4)} disabled={!zoomed}>
              <Minus className="size-5" />
            </IconButton>
            <IconButton label="Fit page to screen" onClick={() => applyView(FIT)} disabled={!zoomed}>
              <Maximize className="size-5" />
            </IconButton>
          </div>
          {!ready ? (
            <div className="absolute inset-0 grid place-items-center bg-frost/60" role="status">
              {loadError ? (
                <p className="rounded-2xl bg-paper px-5 py-4 text-ink-deep shadow-paper">
                  This page didn’t load. Go back and open it again.
                </p>
              ) : (
                <span className="flex items-center gap-3 rounded-full bg-paper px-5 py-3 text-graphite shadow-lift">
                  <Spinner className="size-5" /> Getting your page ready…
                </span>
              )}
            </div>
          ) : null}
          {toast ? (
            <div role="status" className="pointer-events-none absolute inset-x-4 top-4 mx-auto max-w-md rounded-2xl bg-ink-deep px-5 py-3 text-white shadow-paper">
              {toast}
            </div>
          ) : null}
        </div>

        {/* Colors (large screens) */}
        <aside className="hidden w-60 shrink-0 overflow-y-auto border-l-2 border-mist/70 bg-paper p-4 lg:block">
          <Palette colors={book.theme.palette} recent={recent} value={color} onChange={setColor} layout="grid">
            {opacityControl}
          </Palette>
        </aside>
      </div>

      {/* Colors (below large) */}
      <div className="shrink-0 border-t-2 border-mist/70 bg-paper lg:hidden">
        <Palette colors={book.theme.palette} recent={recent} value={color} onChange={setColor} layout="row">
          {opacityControl}
        </Palette>
      </div>
      {/* Tools (phones) */}
      <div className="flex shrink-0 items-center justify-between gap-2 overflow-x-auto bg-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <ToolPicker tool={tool} color={color} onChange={setTool} direction="row" />
        {drawTool ? (
          <SizePicker
            sizes={TOOLS[drawTool].sizes}
            value={sizes[drawTool]}
            onChange={(i) => setSizes((s) => ({ ...s, [drawTool]: i }))}
            direction="row"
            color={drawTool === 'eraser' ? 'var(--color-graphite)' : color}
          />
        ) : null}
      </div>

      {confirmClear ? (
        <Dialog label="Clear page" onClose={() => setConfirmClear(false)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Start this page over?</h2>
          <p className="mt-2 text-graphite">All the color on this page is removed. You can tap Undo to bring it back.</p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              variant="danger"
              onClick={() => {
                engineRef.current?.clear()
                setConfirmClear(false)
              }}
            >
              <Trash2 className="size-5" /> Clear page
            </Button>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>
              Keep coloring
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'grid size-11 shrink-0 place-items-center rounded-full text-ink transition-[background-color,opacity,transform] hover:bg-frost active:scale-90 disabled:opacity-30 disabled:hover:bg-transparent',
        className,
      )}
    >
      {children}
    </button>
  )
}

function SaveStatus({ state }: { state: SaveState }) {
  if (state === 'idle') return <p className="text-[0.8125rem] text-graphite">Your work saves by itself</p>
  if (state === 'error')
    return (
      <p className="flex items-center gap-1 text-[0.8125rem] text-error">
        <CloudOff className="size-3.5" /> Not saved yet. Trying again on your next stroke.
      </p>
    )
  if (state === 'saved')
    return (
      <p className="flex items-center gap-1 text-[0.8125rem] text-meadow">
        <Check className="size-3.5" strokeWidth={3} /> Saved
      </p>
    )
  return <p className="text-[0.8125rem] text-graphite">Saving…</p>
}
