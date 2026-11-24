import {
  ArrowLeft,
  Check,
  CloudOff,
  Ellipsis,
  Fence,
  Hand,
  Maximize,
  Minus,
  PenLine,
  Plus,
  Redo2,
  Star,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ColoringEngine, type StrokeStyle } from '../coloring/engine'
import { StageInput } from '../coloring/input'
import { loadRegions } from '../coloring/load-regions'
import { DRAW_TOOLS, isDrawTool, TOOLS, toolWidth, type DrawTool, type FillMode, type ToolId } from '../coloring/tools'
import { clampView, cssTransform, FIT, fitLayout, zoomAt, type Layout, type View } from '../coloring/viewport'
import { Celebration } from '../components/Celebration'
import { FillModePicker, OpacitySlider, Palette, SizePicker, Suggestions, ToolPicker } from '../components/coloring-ui'
import { Dialog } from '../components/Dialog'
import { Spinner, cn } from '../components/ui'
import type { Book, BookPage } from '../content/books'
import { getArtwork, saveArtwork } from '../data/artworks'
import { logEvent } from '../data/events'
import type { Artwork } from '../data/types'
import { playCelebration, ScribbleSound, startFireplace } from '../lib/sounds'
import { useBook, useLibrary } from '../state/library-store'
import { usePrefs } from '../state/prefs-store'
import { useSession } from '../state/session-store'
import { Splash } from './guards'
import { NotFound } from './NotFound'
import { useTitle } from '../lib/useTitle'

const SAVE_DELAY_MS = 1200
/** Gaps longer than this between strokes don't count as time spent coloring. */
const IDLE_GAP_MS = 15_000
/** Below this much color, "I'm finished" asks for a little more first. */
const MIN_TO_FINISH = 0.03

export function ColorScreen() {
  const { bookId, pageId } = useParams()
  const book = useBook(bookId)
  const loaded = useLibrary((s) => s.loaded)
  const index = book?.pages.findIndex((p) => p.id === pageId) ?? -1
  const page = book && index >= 0 ? book.pages[index] : undefined
  if (!book) return loaded ? <NotFound /> : <Splash />
  if (!page || page.kind !== 'line-art') return <NotFound />
  return <Editor key={`${book.id}:${page.id}`} book={book} page={page} index={index} />
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

function initial<T>(pick: (t: DrawTool) => T): Record<DrawTool, T> {
  return Object.fromEntries(DRAW_TOOLS.map((t) => [t, pick(t)])) as Record<DrawTool, T>
}

function Editor({ book, page, index }: { book: Book; page: BookPage; index: number }) {
  useTitle(`Coloring ${page.title}`)
  const navigate = useNavigate()
  const accountId = useSession((s) => s.account?.id) ?? ''
  const profileId = useSession((s) => s.profileId) ?? ''
  const penOnly = usePrefs((s) => s.penOnly)
  const setPenOnly = usePrefs((s) => s.setPenOnly)
  const recent = usePrefs((s) => s.recentColors[profileId]) ?? []
  const addRecentColor = usePrefs((s) => s.addRecentColor)
  const stayInLines = usePrefs((s) => s.stayInLines[profileId] ?? true)
  const setStayInLines = usePrefs((s) => s.setStayInLines)
  const leftHanded = usePrefs((s) => s.leftHanded[profileId] ?? false)
  const setLeftHanded = usePrefs((s) => s.setLeftHanded)
  const drawSounds = usePrefs((s) => s.drawSounds)
  const setDrawSounds = usePrefs((s) => s.setDrawSounds)
  const fireplace = usePrefs((s) => s.fireplace)
  const setFireplace = usePrefs((s) => s.setFireplace)
  const W = book.pageSize.width
  const H = book.pageSize.height
  const nextPage = book.pages.slice(index + 1).find((p) => p.kind === 'line-art')

  const stageRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const colorRef = useRef<HTMLCanvasElement>(null)
  const strokeRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<ColoringEngine | null>(null)

  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [tool, setTool] = useState<ToolId>('crayon')
  const [color, setColor] = useState(book.theme.palette[0])
  const [sizes, setSizes] = useState(() => initial((t) => TOOLS[t].defaultSize))
  const [opacities, setOpacities] = useState(() => initial((t) => TOOLS[t].opacity))
  const [fillMode, setFillMode] = useState<FillMode>('solid')
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [finished, setFinished] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [celebration, setCelebration] = useState<{ colorUrl: string | null } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Input handlers read the latest choices through refs so listeners attach once.
  const live = useRef({ tool, color, sizes, opacities, fillMode, stayInLines, ready })
  live.current = { tool, color, sizes, opacities, fillMode, stayInLines, ready }
  const lastDrawTool = useRef<ToolId>('crayon')
  const viewRef = useRef<View>(FIT)
  const layoutRef = useRef<Layout | null>(null)
  const spaceRef = useRef(false)
  const activity = useRef({ last: 0, ms: 0 })
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const saving = useRef<Promise<Artwork | null> | null>(null)
  const finishedRef = useRef(false)
  const scribble = useRef<ScribbleSound | null>(null)
  scribble.current ??= new ScribbleSound()
  const lastPoint = useRef<{ x: number; y: number; t: number } | null>(null)

  const chooseTool = useCallback((t: ToolId) => {
    if (t !== 'picker') lastDrawTool.current = t
    setTool(t)
  }, [])

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
  const save = useCallback(
    async (opts: { finish?: boolean; force?: boolean } = {}): Promise<Artwork | null> => {
      clearTimeout(saveTimer.current)
      if (saving.current) await saving.current
      const engine = engineRef.current
      if (!engine || !profileId || (!engine.dirty && !opts.force)) return null
      engine.dirty = false
      setSaveState('saving')
      const run = (async (): Promise<Artwork | null> => {
        try {
          const [colorLayer, thumb] = await Promise.all([engine.exportLayer(), engine.exportThumb()])
          const progress = engine.progress()
          const art = await saveArtwork({ profileId, bookId: book.id, pageId: page.id, colorLayer, thumb, progress, finish: opts.finish })
          const stats = engine.takeStats()
          const ms = Math.round(activity.current.ms)
          activity.current.ms = 0
          void logEvent({
            accountId,
            profileId,
            type: 'coloring',
            bookId: book.id,
            pageId: page.id,
            data: {
              ms,
              strokes: stats.strokes,
              fills: stats.fills,
              erases: stats.erases,
              colors: [...stats.colors],
              tools: [...stats.tools],
              progress,
            },
          })
          const isDone = Boolean(art.completedAt)
          if (isDone && !finishedRef.current && !opts.finish) setToast('This page is finished! Keep adding color as long as you like.')
          finishedRef.current = isDone
          setFinished(isDone)
          setSaveState(engine.dirty ? 'pending' : 'saved')
          return art
        } catch {
          engine.dirty = true
          setSaveState('error')
          return null
        }
      })()
      saving.current = run
      const result = await run
      saving.current = null
      return result
    },
    [accountId, profileId, book.id, page.id],
  )

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
        finishedRef.current = Boolean(artwork?.completedAt)
        setFinished(finishedRef.current)
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
    const style = (): StrokeStyle | null => {
      const { tool: t, color: c, sizes: s, opacities: o, stayInLines: stay } = live.current
      if (!isDrawTool(t)) return null
      return {
        tool: t,
        color: c,
        width: toolWidth(t, s[t], W),
        opacity: o[t],
        pressure: TOOLS[t].pressure,
        stayInLines: stay,
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
        const s = style()
        if (!s) return
        noteActivity()
        engineRef.current?.beginStroke(s, pt)
        scribble.current?.start(s.tool)
        lastPoint.current = { x: pt.x, y: pt.y, t: performance.now() }
      },
      onStrokeMove: (pts) => {
        engineRef.current?.extendStroke(pts)
        // Drawing sound follows the stroke speed (page pixels per millisecond).
        const end = pts[pts.length - 1]
        const prev = lastPoint.current
        const now = performance.now()
        if (end && prev && now > prev.t) scribble.current?.update(Math.hypot(end.x - prev.x, end.y - prev.y) / (now - prev.t))
        if (end) lastPoint.current = { x: end.x, y: end.y, t: now }
      },
      onStrokeEnd: () => {
        scribble.current?.stop()
        noteActivity()
        const t = live.current.tool
        if (engineRef.current?.endStroke() && t !== 'eraser') addRecentColor(profileId, live.current.color)
      },
      onStrokeCancel: () => {
        scribble.current?.stop()
        engineRef.current?.cancelStroke()
      },
      onTap: (pt) => {
        const engine = engineRef.current
        if (!engine) return
        if (live.current.tool === 'picker') {
          setColor(engine.pick(pt.x, pt.y))
          setTool(lastDrawTool.current) // back to what they were coloring with
          return
        }
        noteActivity()
        const { color: c, fillMode: mode } = live.current
        if (engine.fill(pt.x, pt.y, c, mode) && mode !== 'rainbow') addRecentColor(profileId, c)
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
        if (!isDrawTool(t)) return
        setSizes((s) => ({ ...s, [t]: Math.max(0, Math.min(TOOLS[t].sizes.length - 1, s[t] + (k === ']' ? 1 : -1))) }))
      } else if (!mod) {
        const match = (Object.keys(TOOLS) as ToolId[]).find((id) => TOOLS[id].shortcut === k)
        if (match) chooseTool(match)
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
  }, [applyView, zoomBy, chooseTool])

  useEffect(() => (fireplace ? startFireplace() : undefined), [fireplace])
  useEffect(() => () => scribble.current?.stop(), [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!celebration?.colorUrl) return
    const url = celebration.colorUrl
    return () => URL.revokeObjectURL(url)
  }, [celebration])

  // ── Leaving and finishing ────────────────────────────────────────────────
  async function goTo(path: string) {
    setBusy(true)
    await save()
    navigate(path)
  }
  const toBook = () => goTo(`/books/${book.id}/read?page=${index}`)

  async function finish() {
    const engine = engineRef.current
    if (!engine || !ready) return
    if (engine.progress() < MIN_TO_FINISH) {
      setToast('Add some color first, then tap I’m finished.')
      return
    }
    setBusy(true)
    const art = await save({ finish: true, force: true })
    setBusy(false)
    if (!art) return
    playCelebration()
    setCelebration({ colorUrl: art.thumb ? URL.createObjectURL(art.thumb) : null })
  }

  // ── Layout pieces ────────────────────────────────────────────────────────
  const drawTool: DrawTool | null = isDrawTool(tool) ? tool : null
  const toolOptions = (direction: 'row' | 'column') =>
    drawTool ? (
      <SizePicker
        sizes={TOOLS[drawTool].sizes}
        value={sizes[drawTool]}
        onChange={(i) => setSizes((s) => ({ ...s, [drawTool]: i }))}
        direction={direction}
        color={drawTool === 'eraser' ? 'var(--color-graphite)' : color}
      />
    ) : tool === 'fill' ? (
      <FillModePicker value={fillMode} onChange={setFillMode} color={color} direction={direction} />
    ) : (
      <p className="max-w-16 text-center text-[0.75rem] text-graphite">Tap the page to pick up a color</p>
    )
  const showsStrength = drawTool !== null && drawTool !== 'eraser' && drawTool !== 'glitter'
  const opacityControl = showsStrength ? (
    <OpacitySlider value={opacities[drawTool]} onChange={(v) => setOpacities((o) => ({ ...o, [drawTool]: v }))} color={color} />
  ) : null

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-frost select-none">
      {/* Top bar */}
      <header className="relative z-20 flex shrink-0 items-center gap-1 border-b-2 border-mist/70 bg-paper px-2 py-2 sm:gap-1.5 sm:px-3">
        <button
          type="button"
          onClick={toBook}
          disabled={busy}
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
        <Toggle
          on={stayInLines}
          onChange={(v) => setStayInLines(profileId, v)}
          icon={<Fence className="size-5" />}
          label="Stay in lines"
          title={stayInLines ? 'Color stays inside the shape you start in.' : 'Color can go over the lines.'}
        />
        <Toggle
          on={penOnly}
          onChange={setPenOnly}
          icon={penOnly ? <PenLine className="size-5" /> : <Hand className="size-5" />}
          label={penOnly ? 'Pencil only' : 'Finger draws'}
          title={penOnly ? 'Only the pencil draws. Fingers move the page.' : 'Fingers and pencil both draw.'}
        />
        <div className="relative">
          <IconButton label="More" onClick={() => setMenuOpen((o) => !o)}>
            <Ellipsis className="size-6" />
          </IconButton>
          {menuOpen ? (
            <Menu onClose={() => setMenuOpen(false)}>
              <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl px-3 hover:bg-frost">
                <span>
                  <span className="block font-semibold text-ink-deep">Left-handed</span>
                  <span className="block text-[0.8125rem] text-graphite">Tools on the right, colors on the left</span>
                </span>
                <input
                  type="checkbox"
                  checked={leftHanded}
                  onChange={(e) => setLeftHanded(profileId, e.target.checked)}
                  className="size-5 accent-[var(--color-ink)]"
                />
              </label>
              <MenuCheck label="Drawing sounds" hint="A soft scratch as you color" checked={drawSounds} onChange={setDrawSounds} />
              <MenuCheck label="Fireplace sounds" hint="A cozy crackle in the background" checked={fireplace} onChange={setFireplace} />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmClear(true)
                }}
                disabled={!ready}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left font-semibold text-error hover:bg-error/8"
              >
                <Trash2 className="size-5" /> Clear page
              </button>
            </Menu>
          ) : null}
        </div>
        <button
          type="button"
          onClick={finish}
          disabled={!ready || busy}
          className={cn(
            'ml-1 inline-flex min-h-12 items-center gap-2 rounded-full px-4 font-semibold shadow-lift transition-transform active:scale-95 disabled:opacity-60 sm:px-5',
            finished ? 'bg-meadow-ink text-white' : 'bg-sunflower text-ink-deep',
          )}
        >
          {busy ? <Spinner /> : finished ? <Check className="size-5" strokeWidth={3} /> : <Star className="size-5 fill-current" />}
          <span className="hidden sm:inline">{finished ? 'Finished' : 'I’m finished'}</span>
        </button>
      </header>

      <div className={cn('flex min-h-0 flex-1', leftHanded && 'flex-row-reverse')}>
        {/* Tools (tablet and up) */}
        <aside
          className={cn(
            'hidden shrink-0 flex-col items-center gap-2 overflow-y-auto border-mist/70 bg-paper px-2 py-2 md:flex',
            leftHanded ? 'border-l-2' : 'border-r-2',
          )}
        >
          <ToolPicker tool={tool} color={color} onChange={chooseTool} direction="column" />
          <span aria-hidden className="h-0.5 w-10 shrink-0 rounded bg-mist" />
          {toolOptions('column')}
        </aside>

        {/* The page */}
        <div
          ref={stageRef}
          className="relative min-w-0 flex-1 touch-none overflow-hidden [-webkit-touch-callout:none]"
          style={{ cursor: tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : 'crosshair' }}
        >
          <div ref={sheetRef} className="absolute top-0 left-0 origin-top-left bg-[#fffefb] shadow-paper will-change-transform">
            <canvas ref={colorRef} width={W} height={H} className="absolute inset-0 size-full" />
            <canvas ref={strokeRef} width={W} height={H} className="absolute inset-0 size-full" />
            <img src={page.image} alt={page.title} draggable={false} className="pointer-events-none absolute inset-0 size-full" />
          </div>
          <div
            data-stage-ui
            className={cn('absolute bottom-3 flex flex-col gap-1 rounded-full bg-paper/95 p-1 shadow-lift', leftHanded ? 'left-3' : 'right-3')}
          >
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
                <p className="rounded-2xl bg-paper px-5 py-4 text-ink-deep shadow-paper">This page didn’t load. Go back and open it again.</p>
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
        <aside
          className={cn(
            'hidden w-64 shrink-0 overflow-y-auto border-mist/70 bg-paper p-4 lg:block',
            leftHanded ? 'border-r-2' : 'border-l-2',
          )}
        >
          <Palette colors={book.theme.palette} recent={recent} value={color} onChange={setColor} layout="grid">
            <Suggestions color={color} onPick={setColor} layout="grid" />
            {opacityControl}
          </Palette>
        </aside>
      </div>

      {/* Colors (below large) */}
      <div className="shrink-0 border-t-2 border-mist/70 bg-paper lg:hidden">
        <Palette colors={book.theme.palette} recent={recent} value={color} onChange={setColor} layout="row">
          <Suggestions color={color} onPick={setColor} layout="row" />
          {opacityControl ? <div className="w-56">{opacityControl}</div> : null}
        </Palette>
      </div>
      {/* Tools (phones) */}
      <div className="flex shrink-0 flex-col gap-1 bg-paper px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        <div className="overflow-x-auto">
          <ToolPicker tool={tool} color={color} onChange={chooseTool} direction="row" />
        </div>
        <div className="flex justify-center overflow-x-auto">{toolOptions('row')}</div>
      </div>

      {confirmClear ? (
        <Dialog label="Clear page" onClose={() => setConfirmClear(false)}>
          <h2 className="font-display text-heading font-bold text-ink-deep">Start this page over?</h2>
          <p className="mt-2 text-graphite">All the color on this page is removed. You can tap Undo to bring it back.</p>
          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                engineRef.current?.clear()
                setConfirmClear(false)
              }}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-paper font-semibold text-error ring-2 ring-inset ring-error/30 hover:bg-error hover:text-white"
            >
              <Trash2 className="size-5" /> Clear page
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="min-h-12 rounded-full font-semibold text-ink hover:bg-frost">
              Keep coloring
            </button>
          </div>
        </Dialog>
      ) : null}

      {celebration ? (
        <Celebration
          pageTitle={page.title}
          colorUrl={celebration.colorUrl}
          lineArt={page.image}
          nextTitle={nextPage?.title}
          onNext={nextPage ? () => navigate(`/color/${book.id}/${nextPage.id}`, { replace: true }) : undefined}
          onBook={() => navigate(`/books/${book.id}/read?page=${index}`)}
          onKeep={() => setCelebration(null)}
        />
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

function Toggle({
  on,
  onChange,
  icon,
  label,
  title,
}: {
  on: boolean
  onChange: (v: boolean) => void
  icon: ReactNode
  label: string
  title: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      aria-label={label}
      title={title}
      className={cn(
        'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-[0.875rem] font-semibold transition-colors',
        on ? 'bg-ink text-white' : 'text-graphite hover:bg-frost',
      )}
    >
      {icon}
      <span className="hidden xl:inline">{label}</span>
    </button>
  )
}

/** A small dropdown that closes on outside tap or Escape. */
function Menu({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    // Defer so the tap that opened the menu doesn't close it.
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div ref={ref} role="menu" className="absolute top-full right-0 z-30 mt-2 w-72 rounded-2xl bg-paper p-2 shadow-paper ring-1 ring-mist">
      {children}
    </div>
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
      <p className="flex items-center gap-1 text-[0.8125rem] text-meadow-ink">
        <Check className="size-3.5" strokeWidth={3} /> Saved
      </p>
    )
  return <p className="text-[0.8125rem] text-graphite">Saving…</p>
}

function MenuCheck({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl px-3 hover:bg-frost">
      <span>
        <span className="block font-semibold text-ink-deep">{label}</span>
        <span className="block text-[0.8125rem] text-graphite">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-5 accent-[var(--color-ink)]" />
    </label>
  )
}
