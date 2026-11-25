import { ArrowLeft, Check, CloudOff, Ellipsis, Hand, Minus, Palette as PaletteIcon, Plus, Redo2, Star, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router'
import { isBookLocked } from '../data/plans'
import { ColoringEngine, type StrokeStyle } from '../coloring/engine'
import { StageInput } from '../coloring/input'
import { loadRegions } from '../coloring/load-regions'
import {
  hasSize,
  hasStrength,
  SIZE_RANGE,
  settingsFor,
  sizeFraction,
  slideSize,
  slideStrength,
  stepSize,
  stepStrength,
  STRENGTH_RANGE,
  STRENGTH_STEP,
  strengthFraction,
} from '../coloring/tool-settings'
import { isDrawTool, TOOLS, toolWidth, type DrawTool, type FillMode, type ToolId } from '../coloring/tools'
import { clampView, cssTransform, FIT, fitLayout, MAX_SCALE, zoomAt, type Layout, type View } from '../coloring/viewport'
import { Celebration } from '../components/Celebration'
import { ClayButton, ClayToggle, PaperCard } from '../components/cozy'
import { ColorsPanel, ColorsTab, PctRing, SlideControl, ToolRack } from '../components/studio'
import { Spinner, cn } from '../components/ui'
import { sceneBackground } from '../content/scenes'
import { accentStyle } from '../lib/accent'
import { useModal } from '../lib/useModal'
import { useProfileInsights } from '../state/hooks'
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
  const plan = useSession((s) => s.account?.plan)
  if (!book) return loaded ? <NotFound /> : <Splash />
  if (isBookLocked(book, plan)) return <Navigate to={`/books/${book.id}`} replace />
  if (!page || page.kind !== 'line-art') return <NotFound />
  return <Editor key={`${book.id}:${page.id}`} book={book} page={page} index={index} />
}

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/** The studio chrome is drawn at iPad size (1366×1024) and scaled to the window; below this it switches to the phone layout. */
const DESIGN_W = 1366
const DESIGN_H = 1024
const MIN_CHROME = 0.6

function useWindowSize() {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))
  useEffect(() => {
    const on = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return size
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
  const savedSettings = usePrefs((s) => s.toolSettings[profileId])
  const settings = useMemo(() => settingsFor(savedSettings), [savedSettings])
  const setToolSetting = usePrefs((s) => s.setToolSetting)
  const tucked = usePrefs((s) => s.colorsTucked[profileId] ?? false)
  const setTucked = usePrefs((s) => s.setColorsTucked)
  const sound = usePrefs((s) => s.sound)
  const markStickersSeen = usePrefs((s) => s.markStickersSeen)
  const insights = useProfileInsights()
  const [fillMode, setFillMode] = useState<FillMode>('solid')
  const [hist, setHist] = useState({ canUndo: false, canRedo: false })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [finished, setFinished] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [celebration, setCelebration] = useState<{ colorUrl: string | null; stickerIds: string[] } | null>(null)
  const [pct, setPct] = useState(0)
  const [zoomPct, setZoomPct] = useState(100)
  const [hand, setHand] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const { w: winW, h: winH } = useWindowSize()
  const chrome = Math.min(1, winW / DESIGN_W, winH / DESIGN_H)
  // The iPad-style layout needs a landscape-ish window; upright tablets get the compact one, where the
  // tool rack and colors don't sit over the page.
  const wide = chrome >= MIN_CHROME && winW >= 900 && winW >= winH * 0.95
  const moreRef = useRef<HTMLButtonElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)
  const clearRef = useRef<HTMLButtonElement>(null)
  const colorsBtnRef = useRef<HTMLButtonElement>(null)
  const tabRef = useRef<HTMLButtonElement>(null)
  const panelBoxRef = useRef<HTMLDivElement>(null)
  const [liveText, setLiveText] = useState('')
  const headerRef = useRef<HTMLElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const [compactBars, setCompactBars] = useState({ top: 64, bottom: 150, side: 0 })
  /** Phones held sideways: the tool tray runs down the side so the page keeps the height. */
  const sideTray = !wide && winW > winH
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Input handlers read the latest choices through refs so listeners attach once.
  const live = useRef({ tool, color, settings, fillMode, stayInLines, ready })
  live.current = { tool, color, settings, fillMode, stayInLines, ready }
  const handRef = useRef(false)
  handRef.current = hand
  const pctTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
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
  const modalOpen = useRef(false)

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
    setZoomPct(Math.round(next.scale * 100))
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
      layoutRef.current = fitLayout(stage.clientWidth, stage.clientHeight, W / H, 14)
      applyView(viewRef.current)
    })
    ro.observe(stage)
    return () => ro.disconnect()
  }, [W, H, applyView, wide])

  // Phone layout: the page fills the space between the top bar and the tool tray.
  useLayoutEffect(() => {
    if (wide) return
    const head = headerRef.current
    const foot = bottomRef.current
    if (!head || !foot) return
    const read = () =>
      setCompactBars(sideTray ? { top: head.offsetHeight, bottom: 0, side: foot.offsetWidth } : { top: head.offsetHeight, bottom: foot.offsetHeight, side: 0 })
    read()
    const ro = new ResizeObserver(read)
    ro.observe(head)
    ro.observe(foot)
    return () => ro.disconnect()
  }, [wide, sideTray])

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
    const measure = () => {
      clearTimeout(pctTimer.current)
      pctTimer.current = setTimeout(() => setPct(Math.round(engine.progress() * 100)), 250)
    }
    const unsubscribe = engine.subscribe(() => {
      setHist({ canUndo: engine.canUndo, canRedo: engine.canRedo })
      if (engine.dirty) scheduleSave()
      measure()
    })

    Promise.all([loadRegions(page.image, W, H), profileId ? getArtwork(profileId, book.id, page.id) : undefined])
      .then(async ([regions, artwork]) => {
        if (cancelled) return
        engine.setRegions(regions)
        if (artwork?.colorLayer) await engine.load(artwork.colorLayer)
        if (cancelled) return
        finishedRef.current = Boolean(artwork?.completedAt)
        setFinished(finishedRef.current)
        setPct(Math.round(engine.progress() * 100))
        setReady(true)
        if (accountId && profileId)
          void logEvent({ accountId, profileId, type: 'color_open', bookId: book.id, pageId: page.id, data: { pageIndex: index } })
      })
      .catch(() => !cancelled && setLoadError(true))

    const onHide = () => document.visibilityState === 'hidden' && void save()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      cancelled = true
      clearTimeout(pctTimer.current)
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
      const { tool: t, color: c, settings: set, stayInLines: stay } = live.current
      if (!isDrawTool(t)) return null
      return {
        tool: t,
        color: c,
        width: toolWidth(set[t].size, W),
        opacity: hasStrength(t) ? set[t].strength / 100 : TOOLS[t].opacity,
        pressure: TOOLS[t].pressure,
        stayInLines: stay,
      }
    }
    const input = new StageInput(stage, {
      ready: () => live.current.ready && engineRef.current !== null,
      tool: () => live.current.tool,
      // "Move the page" mode: fingers and the mouse move the page instead of drawing.
      penOnly: () => usePrefs.getState().penOnly || handRef.current,
      spaceHeld: () => spaceRef.current || handRef.current,
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
      const target = e.target instanceof HTMLElement ? e.target : null
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return
      // Nothing behind the celebration or the colors sheet reacts to keys.
      if (modalOpen.current) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      // Single-key shortcuts and Space (hold to move the page) only when no button or other control has
      // focus, so Space and Enter still press whatever is focused.
      const onControl =
        target !== null && target !== document.body && !stageRef.current?.contains(target) && target.closest('button,a,[role],select,label') !== null
      if (!mod && onControl) return
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
        const cur = live.current.settings[t]
        setToolSetting(profileId, t, { ...cur, size: stepSize(t, cur.size, k === ']' ? 1 : -1) })
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
  }, [applyView, zoomBy, chooseTool, setToolSetting, profileId])

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

  modalOpen.current = Boolean(celebration || sheetOpen)

  // One screen-reader announcement area for the studio (toasts, the picker hint, save problems).
  useEffect(() => {
    if (toast) setLiveText(toast)
  }, [toast])
  useEffect(() => {
    if (tool === 'picker') setLiveText('Tap the page to pick up a color.')
  }, [tool])
  useEffect(() => {
    if (saveState === 'error') setLiveText('Not saved yet. It will try again on your next stroke.')
  }, [saveState])

  // Keep keyboard focus on something sensible when the Clear page question appears or goes.
  useEffect(() => {
    if (!menuOpen) return
    requestAnimationFrame(() => (confirmClear ? keepRef : clearRef).current?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmClear])
  const closeMenu = useCallback((refocus: boolean) => {
    setMenuOpen(false)
    setConfirmClear(false)
    if (refocus) requestAnimationFrame(() => moreRef.current?.focus())
  }, [])

  // Tucking the colors away (or bringing them back) hides the button you pressed: move focus along.
  const tuckSeen = useRef(false)
  useEffect(() => {
    if (!tuckSeen.current) {
      tuckSeen.current = true
      return
    }
    requestAnimationFrame(() => {
      if (tucked) tabRef.current?.focus()
      else panelBoxRef.current?.querySelector<HTMLElement>('[data-tuck]')?.focus()
    })
  }, [tucked])

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
    // Stickers already earned or celebrated now; anything newer is shown on the celebration card.
    const seen = usePrefs.getState().seenStickers[profileId] ?? []
    const before = (insights?.stickers ?? []).filter((x) => x.earned).map((x) => x.id)
    setCelebration({ colorUrl: art.thumb ? URL.createObjectURL(art.thumb) : null, stickerIds: [...before, ...seen] })
  }

  // ── Layout pieces ────────────────────────────────────────────────────────
  const drawTool: DrawTool | null = isDrawTool(tool) ? tool : null
  const sizeTool: DrawTool | null = isDrawTool(tool) && hasSize(tool) ? tool : null
  const strengthTool: DrawTool | null = isDrawTool(tool) && hasStrength(tool) ? tool : null
  const setting = drawTool ? settings[drawTool] : null
  const updateSetting = (patch: Partial<{ size: number; strength: number }>) => {
    if (!drawTool) return
    setToolSetting(profileId, drawTool, { ...settings[drawTool], ...patch })
  }
  const mirrored = leftHanded
  const saveText =
    saveState === 'error' ? 'not saved yet' : saveState === 'pending' || saveState === 'saving' ? 'saving…' : saveState === 'saved' ? 'saved' : 'saves by itself'
  const newSticker =
    celebration && insights ? insights.stickers.find((x) => x.earned && !celebration.stickerIds.includes(x.id)) : undefined
  // Shown on the celebration card, so Home doesn't announce it again.
  const newStickerId = newSticker?.id
  useEffect(() => {
    if (newStickerId) markStickersSeen(profileId, [newStickerId])
  }, [newStickerId, markStickersSeen, profileId])

  const sizeControl = (big: boolean) => {
    const frac = sizeTool && setting ? sizeFraction(sizeTool, setting.size) : 0
    const dot = big ? Math.round(8 + frac * 48) : Math.round(6 + frac * 30)
    return (
      <SlideControl
        label="Size"
        value={setting?.size ?? 0}
        min={sizeTool ? SIZE_RANGE[sizeTool][0] : 0}
        max={sizeTool ? SIZE_RANGE[sizeTool][1] : 0}
        fraction={frac}
        display={sizeTool ? String(setting?.size ?? 0) : '—'}
        color={tool === 'eraser' ? '#a89580' : color}
        disabled={!sizeTool}
        onSlide={(start, dx) => sizeTool && updateSetting({ size: slideSize(sizeTool, start, dx, mirrored) })}
        onStep={(dir) => sizeTool && setting && updateSetting({ size: stepSize(sizeTool, setting.size, dir) })}
        onSet={(v) => sizeTool && updateSetting({ size: Math.round(Math.max(SIZE_RANGE[sizeTool][0], Math.min(SIZE_RANGE[sizeTool][1], v))) })}
        lessLabel="Smaller"
        moreLabel="Bigger"
        preview={<span className="block rounded-full" style={{ width: dot, height: dot, background: !sizeTool ? '#c9b89c' : tool === 'eraser' ? '#a89580' : color }} />}
        hint={
          big ? (
            <>
              Size
              <br />
              <span className="text-[16px]">press &amp; slide</span>
            </>
          ) : undefined
        }
        size={big ? 80 : 56}
        popAbove={!big}
        mirrored={mirrored}
      />
    )
  }
  const strengthControl = (big: boolean) => {
    const frac = strengthTool && setting ? strengthFraction(setting.strength) : 1
    return (
      <SlideControl
        label="Strength"
        value={setting?.strength ?? 100}
        min={STRENGTH_RANGE[0]}
        max={STRENGTH_RANGE[1]}
        fraction={frac}
        display={strengthTool ? `${setting?.strength ?? 100}%` : '—'}
        color={color}
        disabled={!strengthTool}
        onSlide={(start, dx) => strengthTool && updateSetting({ strength: slideStrength(start, dx, mirrored) })}
        onStep={(dir) => strengthTool && setting && updateSetting({ strength: stepStrength(setting.strength, dir) })}
        onSet={(v) =>
          strengthTool &&
          updateSetting({ strength: Math.max(STRENGTH_RANGE[0], Math.min(STRENGTH_RANGE[1], Math.round(v / STRENGTH_STEP) * STRENGTH_STEP)) })
        }
        lessLabel="Lighter"
        moreLabel="Stronger"
        preview={
          <span
            className="block rounded-full"
            style={{
              width: big ? 44 : 30,
              height: big ? 44 : 30,
              background: color,
              opacity: strengthTool ? 0.15 + 0.85 * frac : 0.25,
              boxShadow: '0 0 0 3px rgb(62 42 30 / 0.15)',
            }}
          />
        }
        hint={
          big ? (
            <>
              Strength
              <br />
              <span className="text-[16px]">press &amp; slide</span>
            </>
          ) : undefined
        }
        size={big ? 80 : 56}
        popAbove={!big}
        mirrored={mirrored}
      />
    )
  }

  const menu = menuOpen ? (
    <StudioMenu onClose={closeMenu} className={wide ? 'w-[372px]' : 'max-h-[calc(100dvh-5.5rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto'}>
      {!wide && winW <= 430 ? (
        <ClayButton tone="cream" size="sm" disabled={!hist.canRedo} onClick={() => engineRef.current?.redo()}>
          <Redo2 className="size-5" strokeWidth={2.6} aria-hidden /> Redo
        </ClayButton>
      ) : null}
      {wide ? null : <MenuToggle label="Stay in lines" hint="Color stays inside the shape you start in" checked={stayInLines} onChange={(v) => setStayInLines(profileId, v)} />}
      <MenuToggle label="Drawing sounds" checked={drawSounds} onChange={setDrawSounds} hint={sound ? undefined : 'Sounds are off in the reader'} />
      <MenuToggle label="Fireplace sounds" checked={fireplace} onChange={setFireplace} />
      <MenuToggle label="Left-handed" hint="Tools on the right, colors on the left" checked={leftHanded} onChange={(v) => setLeftHanded(profileId, v)} />
      <MenuToggle label="Pencil only" hint="Fingers and palms won’t draw" checked={penOnly} onChange={setPenOnly} />
      {confirmClear ? (
        <div className="flex flex-col gap-3">
          <p className="text-[19px] leading-snug font-bold text-ink-deep">Clear the whole page? You can undo it.</p>
          <div className="flex gap-2.5">
            <ClayButton
              tone="cran"
              size="sm"
              onClick={() => {
                engineRef.current?.clear()
                setLiveText('The page is clear. Undo brings the color back.')
                closeMenu(true)
              }}
            >
              Clear it
            </ClayButton>
            <ClayButton ref={keepRef} tone="cream" size="sm" onClick={() => setConfirmClear(false)}>
              Keep it
            </ClayButton>
          </div>
        </div>
      ) : (
        <ClayButton ref={clearRef} tone="cream" size="sm" disabled={!ready} onClick={() => setConfirmClear(true)} className="!text-rust">
          Clear page
        </ClayButton>
      )}
    </StudioMenu>
  ) : null

  const finishLabel = finished ? 'Finished' : 'I’m finished'

  /** The page, on the desk. Shared by both layouts. */
  const stage = (
    <div
      ref={stageRef}
      className="absolute inset-x-0 touch-none overflow-hidden [-webkit-touch-callout:none]"
      style={{
        top: wide ? 100 * chrome : compactBars.top,
        bottom: wide ? 0 : compactBars.bottom,
        left: !wide && !mirrored ? compactBars.side : 0,
        right: !wide && mirrored ? compactBars.side : 0,
        cursor: hand ? 'grab' : tool === 'fill' ? 'cell' : tool === 'picker' ? 'copy' : 'crosshair' }}
    >
      <div ref={sheetRef} className="absolute top-0 left-0 origin-top-left will-change-transform">
        <div aria-hidden className="ll-paper ll-paper-flat absolute -inset-2.5 !bg-[#fffdf8] ![background-image:none]" />
        <canvas ref={colorRef} width={W} height={H} className="absolute inset-0 size-full" />
        <canvas ref={strokeRef} width={W} height={H} className="absolute inset-0 size-full" />
        <img src={page.image} alt={page.title} draggable={false} className="pointer-events-none absolute inset-0 size-full" />
      </div>
      {tool === 'picker' ? (
        <p aria-hidden className="ll-studio-pill ll-float pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 px-4 py-3 text-center text-[1.0625rem] font-bold whitespace-nowrap text-ink-deep">
          Tap the page to pick up a color
        </p>
      ) : null}
      {!ready ? (
        <div className="absolute inset-0 grid place-items-center" role="status">
          {loadError ? (
            <PaperCard className="px-5 py-4 font-bold text-ink-deep">This page didn’t load. Go back and open it again.</PaperCard>
          ) : (
            <span className="ll-studio-pill ll-float flex items-center gap-3 px-5 py-3 font-bold text-graphite">
              <Spinner className="size-5" /> Getting your page ready…
            </span>
          )}
        </div>
      ) : null}
      {toast ? (
        <div aria-hidden className="ll-paper pointer-events-none absolute inset-x-4 top-4 mx-auto max-w-md px-5 py-3 text-center font-bold text-ink-deep">
          {toast}
        </div>
      ) : null}
    </div>
  )

  const colorsPanel = (sheet: boolean) => (
    <ColorsPanel
      palette={book.theme.palette}
      recent={recent}
      value={color}
      onChange={setColor}
      onTuck={() => (sheet ? setSheetOpen(false) : setTucked(profileId, true))}
      tuckLabel={sheet ? 'Close colors' : 'Tuck colors away'}
      mirrored={mirrored}
      fillMode={fillMode}
      onFillMode={setFillMode}
      showFill={tool === 'fill'}
      className={sheet ? 'max-h-[70dvh] overflow-y-auto' : 'h-full overflow-y-auto'}
    />
  )

  return (
    <main
      className="relative isolate h-dvh overflow-clip bg-[#cc9157] bg-cover bg-center select-none"
      style={{ ...accentStyle(book.theme), backgroundImage: sceneBackground('studio', book.season, winW * (window.devicePixelRatio || 1) <= 1300) }}
    >
      <p role="status" className="sr-only">
        {liveText}
      </p>
      {fireplace ? <div aria-hidden className="ll-fire-glow" /> : null}
      {/* The page stays mounted in the same place in both layouts, so the engine keeps its canvases. */}
      {stage}
      {wide ? (
        <>

          {/* Top bar, left half */}
          <div className="absolute top-0 left-0 z-20" style={{ transform: `scale(${chrome})`, transformOrigin: '0 0' }}>
            <ClayButton tone="cran" onClick={toBook} disabled={busy} className="!absolute top-5 left-6 !h-16 !pr-6 !pl-4 !text-[27px]">
              <ArrowLeft className="size-8" strokeWidth={2.6} aria-hidden /> Book
            </ClayButton>
            <div className="ll-studio-pill ll-float absolute top-[18px] left-[166px] flex h-[68px] w-[368px] flex-col justify-center px-[26px]">
              <h1 className="truncate font-display text-[28px] leading-none font-semibold text-ink">{page.title}</h1>
              <p className={cn('mt-[5px] flex items-center gap-1 truncate text-[15px] leading-none font-bold', saveState === 'error' ? 'text-error' : 'text-graphite')}>
                {saveState === 'error' ? <CloudOff className="size-3.5" aria-hidden /> : null}
                {book.title} · page {index} · {saveText}
              </p>
            </div>
            <p className="ll-studio-pill ll-float absolute top-[18px] left-[546px] flex h-[68px] w-[178px] items-center justify-center gap-2.5 font-display text-[23px] leading-none font-semibold text-ink-deep">
              <PctRing pct={pct} /> {pct}% colored
            </p>
            <div className="ll-studio-pill ll-float absolute top-[18px] left-[744px] flex h-[68px] w-[214px] items-center gap-3 pr-2.5 pl-[18px]">
              <span id="cs-lines" className="font-display text-[20px] leading-[1.05] font-semibold text-ink-deep">
                Stay in
                <br />
                lines
              </span>
              <ClayToggle checked={stayInLines} onChange={(v) => setStayInLines(profileId, v)} labelledBy="cs-lines" className="ll-toggle-mini" tone={{ on: 'var(--ll-pine)', onDk: 'var(--ll-pine-dk)' }} />
            </div>
          </div>

          {/* Top bar, right half */}
          <div className="absolute top-0 right-0 z-20" style={{ transform: `scale(${chrome})`, transformOrigin: '100% 0' }}>
            <ClayButton round diameter={60} tone="cream" aria-label="Undo" title="Undo" disabled={!hist.canUndo} onClick={() => engineRef.current?.undo()} className="!absolute top-[22px] right-[334px]">
              <Undo2 className="size-7" strokeWidth={2.6} aria-hidden />
            </ClayButton>
            <ClayButton round diameter={60} tone="cream" aria-label="Redo" title="Redo" disabled={!hist.canRedo} onClick={() => engineRef.current?.redo()} className="!absolute top-[22px] right-[264px]">
              <Redo2 className="size-7" strokeWidth={2.6} aria-hidden />
            </ClayButton>
            <ClayButton
              ref={moreRef}
              round
              diameter={60}
              tone="cream"
              aria-label="More"
              aria-expanded={menuOpen}
              data-more
              onClick={() => (menuOpen ? closeMenu(false) : setMenuOpen(true))}
              className="!absolute top-[22px] right-[194px]"
            >
              <Ellipsis className="size-8" strokeWidth={2.6} aria-hidden />
            </ClayButton>
            {menu ? <div className="absolute top-24 right-[124px]">{menu}</div> : null}
            <ClayButton tone="pine" onClick={finish} disabled={!ready || busy} className="!absolute top-5 right-5 !h-16 !w-40 !px-3 text-center !text-[22px] !leading-[1.05]">
              {busy ? null : finished ? <Check className="size-6 shrink-0" strokeWidth={3} aria-hidden /> : <Star className="size-6 shrink-0" fill="currentColor" aria-hidden />}
              {finishLabel}
            </ClayButton>
          </div>

          {/* Tool rack, size and strength */}
          <div className={cn('absolute top-0 z-10', mirrored ? 'right-0' : 'left-0')} style={{ transform: `scale(${chrome})`, transformOrigin: mirrored ? '100% 0' : '0 0' }}>
            <div className={cn('pointer-events-none absolute top-[104px] h-[700px] w-[400px]', mirrored ? 'right-0' : 'left-0')}>
              <ToolRack tool={tool} color={color} onChange={chooseTool} vertical mirrored={mirrored} />
            </div>
            <div className={cn('absolute top-[818px]', mirrored ? 'right-6' : 'left-6')}>{sizeControl(true)}</div>
            <div className={cn('absolute top-[912px]', mirrored ? 'right-6' : 'left-6')}>{strengthControl(true)}</div>
          </div>

          {/* Colors, and zoom */}
          <div className={cn('absolute top-0 z-10', mirrored ? 'left-0' : 'right-0')} style={{ transform: `scale(${chrome})`, transformOrigin: mirrored ? '0 0' : '100% 0' }}>
            <div
              ref={panelBoxRef}
              className={cn('ll-panel absolute top-[108px] h-[824px] w-[292px]', mirrored ? 'left-5' : 'right-5', tucked && 'invisible')}
              style={{ transform: tucked ? `translateX(${mirrored ? -340 : 340}px)` : undefined }}
            >
              {colorsPanel(false)}
            </div>
            {tucked ? <ColorsTab ref={tabRef} color={color} recent={recent} onOpen={() => setTucked(profileId, false)} mirrored={mirrored} className={cn('!absolute top-[300px]', mirrored ? 'left-0' : 'right-0')} /> : null}
            <div className={cn('absolute top-[948px]', mirrored ? 'left-6' : 'right-6')}>
              <ZoomPill hand={hand} onHand={() => setHand((v) => !v)} pct={zoomPct} zoomed={zoomed} onIn={() => zoomBy(1.5)} onOut={() => zoomBy(1 / 1.5)} onFit={() => applyView(FIT)} />
            </div>
          </div>
        </>
      ) : (
        <>
          <header ref={headerRef} className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
            <ClayButton round diameter={48} tone="cran" aria-label="Back to the book" onClick={toBook} disabled={busy}>
              <ArrowLeft className="size-6" strokeWidth={2.6} aria-hidden />
            </ClayButton>
            <div className="ll-studio-pill ll-float flex h-12 min-w-0 flex-1 items-center gap-2 px-3">
              <PctRing pct={pct} size={22} />
              <div className="min-w-0">
                <h1 className="truncate font-display text-[1.0625rem] leading-tight font-semibold text-ink">{page.title}</h1>
                <p className="truncate text-[0.75rem] leading-tight font-bold text-graphite">
                  {pct}% colored · {saveText}
                </p>
              </div>
            </div>
            <ClayButton round diameter={48} tone="cream" aria-label="Undo" disabled={!hist.canUndo} onClick={() => engineRef.current?.undo()}>
              <Undo2 className="size-6" strokeWidth={2.6} aria-hidden />
            </ClayButton>
            {winW > 430 ? (
              <ClayButton round diameter={48} tone="cream" aria-label="Redo" disabled={!hist.canRedo} onClick={() => engineRef.current?.redo()}>
                <Redo2 className="size-6" strokeWidth={2.6} aria-hidden />
              </ClayButton>
            ) : null}
            <ClayButton
              ref={moreRef}
              round
              diameter={48}
              tone="cream"
              aria-label="More"
              aria-expanded={menuOpen}
              data-more
              onClick={() => (menuOpen ? closeMenu(false) : setMenuOpen(true))}
            >
              <Ellipsis className="size-7" strokeWidth={2.6} aria-hidden />
            </ClayButton>
            {menu ? <div className="absolute top-full right-2 mt-1">{menu}</div> : null}
            <ClayButton round diameter={48} tone="pine" aria-label={finishLabel} title={finishLabel} onClick={finish} disabled={!ready || busy}>
              {finished ? <Check className="size-6" strokeWidth={3} aria-hidden /> : <Star className="size-6" fill="currentColor" aria-hidden />}
            </ClayButton>
          </header>
          <div
            ref={bottomRef}
            className={cn(
              'absolute z-10 bg-[rgb(251_245_232/0.97)]',
              sideTray
                ? cn('bottom-0 flex pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_0_24px_-12px_rgb(50_25_10/0.5)]', mirrored ? 'right-0 flex-row-reverse rounded-tl-[28px]' : 'left-0 rounded-tr-[28px]')
                : 'inset-x-0 bottom-0 rounded-t-[28px] pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-10px_24px_-12px_rgb(50_25_10/0.5)]',
            )}
            style={sideTray ? { top: compactBars.top } : undefined}
          >
            <ToolRack tool={tool} color={color} onChange={chooseTool} column={sideTray} />
            <div className={cn(sideTray ? 'flex flex-col items-center justify-end gap-4 px-3 pb-1' : 'flex items-center gap-4 px-4 pt-2', !sideTray && mirrored && 'flex-row-reverse')}>
              {sizeControl(false)}
              {strengthControl(false)}
              {sideTray ? null : <span className="flex-1" />}
              <button ref={colorsBtnRef} type="button" onClick={() => setSheetOpen(true)} aria-label="Colors" aria-haspopup="dialog" className="ll-clay ll-tone-white ll-clay-sm !pr-4 !pl-2">
                <span aria-hidden className="size-9 rounded-full shadow-[inset_0_-4px_4px_rgb(0_0_0/0.18),0_0_0_3px_#fffdf8]" style={{ background: color }} />
                <PaletteIcon className="size-6" aria-hidden />
              </button>
            </div>
          </div>
          <div
            className="absolute z-10"
            style={{ bottom: (sideTray ? 0 : compactBars.bottom) + 8, ...(mirrored ? { left: 8 } : { right: 8 }) }}
          >
            <ZoomPill compact hand={hand} onHand={() => setHand((v) => !v)} pct={zoomPct} zoomed={zoomed} onIn={() => zoomBy(1.5)} onOut={() => zoomBy(1 / 1.5)} onFit={() => applyView(FIT)} />
          </div>
          {sheetOpen ? (
            <ColorsSheet onClose={() => setSheetOpen(false)} restore={() => colorsBtnRef.current}>
              {colorsPanel(true)}
            </ColorsSheet>
          ) : null}
        </>
      )}

      {celebration ? (
        <Celebration
          pageTitle={page.title}
          colorUrl={celebration.colorUrl}
          lineArt={page.image}
          sticker={newSticker}
          nextTitle={nextPage?.title}
          onNext={nextPage ? () => navigate(`/color/${book.id}/${nextPage.id}`, { replace: true }) : undefined}
          onFridge={() => {
            if (newSticker) markStickersSeen(profileId, [newSticker.id])
            navigate('/gallery')
          }}
          onBook={() => navigate(`/books/${book.id}/read?page=${index}`)}
          onKeep={() => setCelebration(null)}
        />
      ) : null}
    </main>
  )
}

function ZoomPill({
  hand,
  onHand,
  pct,
  zoomed,
  onIn,
  onOut,
  onFit,
  compact,
}: {
  hand: boolean
  onHand: () => void
  pct: number
  zoomed: boolean
  onIn: () => void
  onOut: () => void
  onFit: () => void
  compact?: boolean
}) {
  const d = compact ? 40 : 50
  return (
    <div role="group" aria-label="Zoom" className={cn('ll-studio-pill ll-float flex items-center', compact ? 'h-[52px] gap-1 px-1.5' : 'h-[66px] gap-2 px-2.5')}>
      <ClayButton round diameter={d} tone={hand ? 'navy' : 'cream'} aria-label="Move the page" aria-pressed={hand} title="Move the page" onClick={onHand}>
        <Hand className={compact ? 'size-5' : 'size-6'} aria-hidden />
      </ClayButton>
      <ClayButton round diameter={d} tone="cream" aria-label="Zoom out" disabled={!zoomed} onClick={onOut}>
        <Minus className={compact ? 'size-5' : 'size-6'} strokeWidth={3} aria-hidden />
      </ClayButton>
      <button
        type="button"
        onClick={onFit}
        aria-label={`Zoom ${pct}%. Fit the page to the screen`}
        title="Fit the page to the screen"
        className={cn('min-h-11 rounded-full font-display font-semibold text-ink-deep hover:bg-cream', compact ? 'w-12 text-[0.9375rem]' : 'w-[72px] text-[20px]')}
      >
        {pct}%
      </button>
      <ClayButton round diameter={d} tone="cream" aria-label="Zoom in" disabled={pct >= MAX_SCALE * 100} onClick={onIn}>
        <Plus className={compact ? 'size-5' : 'size-6'} strokeWidth={3} aria-hidden />
      </ClayButton>
    </div>
  )
}

/** The More menu: a paper card that closes on an outside tap or Escape; focus moves into it when it opens. */
function StudioMenu({ onClose, className, children }: { onClose: (refocus: boolean) => void; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button,[role=switch]')?.focus()
    const onDown = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (ref.current && target && !ref.current.contains(target) && !target.closest('[data-more]')) close.current(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current(true)
    }
    const t = setTimeout(() => window.addEventListener('pointerdown', onDown), 0)
    window.addEventListener('keydown', onKey)
    return () => {
      clearTimeout(t)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [])
  return (
    <div ref={ref} role="group" aria-label="More options" className={cn('ll-paper z-30 flex flex-col gap-4 px-[26px] py-[22px]', className)}>
      {children}
    </div>
  )
}

function MenuToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const hintId = useId()
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[20px] leading-tight font-bold text-ink-deep">
        {label}
        {hint ? (
          <span id={hintId} className="block text-[15px] font-bold text-graphite">
            {hint}
          </span>
        ) : null}
      </span>
      <ClayToggle
        checked={checked}
        onChange={onChange}
        label={label}
        describedBy={hint ? hintId : undefined}
        className="ll-toggle-mini"
        tone={{ on: 'var(--ll-pine)', onDk: 'var(--ll-pine-dk)' }}
      />
    </div>
  )
}

/** Phones: the colors as a sheet from the bottom, a proper dialog for the keyboard and screen readers. */
function ColorsSheet({ onClose, restore, children }: { onClose: () => void; restore: () => HTMLElement | null; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  useModal(panel, onClose, { restore })
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-[rgb(40_25_15/0.35)]" onClick={onClose}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Colors"
        tabIndex={-1}
        className="w-full p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
