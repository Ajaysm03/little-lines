import { createContext, useContext, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { SCENE_H, SCENE_W, sceneBackground, sceneUrl, type SceneName, type Season } from '../../content/scenes'
import { usePrefs } from '../../state/prefs-store'
import { cn } from '../ui'

export type SceneLayout = 'scene' | 'band'

interface SceneInfo {
  layout: SceneLayout
  /** Picture pixels (1366×1024 design space) to screen pixels. */
  scale: number
  /** The part of the picture on screen, in design pixels (the band shows its own crop). */
  view: { x0: number; y0: number; x1: number; y1: number }
}

const FULL_VIEW = { x0: 0, y0: 0, x1: SCENE_W, y1: SCENE_H }
const SceneContext = createContext<SceneInfo>({ layout: 'scene', scale: 1, view: FULL_VIEW })

function visible(box: ReturnType<typeof coverBox>, w: number, h: number) {
  return { x0: -box.left / box.scale, y0: -box.top / box.scale, x1: (w - box.left) / box.scale, y1: (h - box.top) / box.scale }
}

/** Whether the current screen shows the full scene or the phone picture band, and the picture scale. */
export function useSceneLayout(): SceneInfo {
  return useContext(SceneContext)
}

/** Phones held upright get the picture band; everything else gets the full scene. */
export function layoutFor(width: number, height: number): SceneLayout {
  return width < 768 && height > width ? 'band' : 'scene'
}

/** The 4:3 picture box that covers a w×h area (centered, cropped on the long side). */
export function coverBox(w: number, h: number) {
  const sw = Math.max(w, (h * SCENE_W) / SCENE_H)
  const sh = (sw * SCENE_H) / SCENE_W
  return { left: (w - sw) / 2, top: (h - sh) / 2, width: sw, height: sh, scale: sw / SCENE_W }
}

/** Measures the scene's root. A callback ref, so it re-attaches when the layout swaps the root element. */
function useSize<T extends HTMLElement>() {
  const [el, setEl] = useState<T | null>(null)
  const [size, setSize] = useState(() => ({
    w: typeof window === 'undefined' ? SCENE_W : window.innerWidth,
    h: typeof window === 'undefined' ? SCENE_H : window.innerHeight,
  }))
  useLayoutEffect(() => {
    if (!el) return
    const read = () => {
      const next = { w: el.clientWidth || window.innerWidth, h: el.clientHeight || window.innerHeight }
      setSize((s) => (s.w === next.w && s.h === next.h ? s : next))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    window.addEventListener('resize', read)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', read)
    }
  }, [el])
  return [setEl, size] as const
}

/**
 * CSS background for a scene: the sharp 2000 px picture on big screens, layered over the 1200 px copy,
 * which is always in the offline cache, so the screen still has its picture offline.
 */
function pickSrc(scene: SceneName, season: Season | null | undefined, boxWidth: number) {
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return sceneBackground(scene, season, boxWidth * dpr <= 1300)
}

/** The 4:3 picture box that fits inside a w×h area (centered, letterboxed on the long side). */
export function containBox(w: number, h: number) {
  const scale = Math.min(w / SCENE_W, h / SCENE_H)
  const width = SCENE_W * scale
  const height = SCENE_H * scale
  return { left: (w - width) / 2, top: (h - height) / 2, width, height, scale }
}

/**
 * A painted scene behind a screen.
 *
 * - `pins`: things tied to the picture (signposts, shelves, hooks), placed with <ScenePin> in 1366×1024
 *   design coordinates. They scale and move with the picture however the screen crops it.
 * - `children`: the screen's own UI, on top. In the full scene it fills the screen (anchor it to the
 *   edges); in the phone band it flows below the picture and scrolls.
 * - `fit`: "cover" fills the screen and crops the picture; "contain" shows the whole picture (so a screen
 *   laid out entirely in pins looks exactly as designed) over a soft blurred copy that fills the edges.
 *   When the contained picture would be smaller than `minScale`, the screen gets the band layout instead.
 *
 * Give the scene a height with className (usually `h-dvh`); the band layout grows with its content.
 */
export function Scene({
  scene,
  season,
  pins,
  pinsInBand = false,
  snow = false,
  fit = 'cover',
  minScale = 0.55,
  main = false,
  className,
  style,
  children,
}: {
  scene: SceneName
  season?: Season | null
  pins?: ReactNode
  /** Also show the pins on the phone picture band (only for big, simple pins). */
  pinsInBand?: boolean
  snow?: boolean
  fit?: 'cover' | 'contain'
  minScale?: number
  /** Render the scene as the screen's <main> landmark (screens whose content lives in pins). */
  main?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}) {
  const [ref, { w, h: elementH }] = useSize<HTMLElement>()
  const snowOn = usePrefs((s) => s.snow) && snow
  const Root = main ? 'main' : 'div'
  // Judge "upright phone" by the window: the band layout grows with its content.
  const viewportH = typeof window === 'undefined' ? SCENE_H : window.innerHeight
  const contain = fit === 'contain'
  const tooSmall = contain && Math.min(w / SCENE_W, viewportH / SCENE_H) < minScale
  const layout: SceneLayout = layoutFor(w, viewportH) === 'band' || tooSmall ? 'band' : 'scene'

  if (layout === 'band') {
    const bandH = Math.round(Math.min(w * 0.75, viewportH * 0.46))
    const box = coverBox(w, bandH)
    return (
      <SceneContext.Provider value={{ layout, scale: box.scale, view: visible(box, w, bandH) }}>
        {/* The page grows and scrolls with its content here, whatever height the screen asked for. */}
        <Root ref={ref} className={cn('ll-scene flex min-h-dvh flex-col', className, '!h-auto !overflow-visible')} style={style}>
          <div className="ll-scene-band shrink-0" style={{ height: bandH }}>
            <div
              aria-hidden={!pinsInBand}
              className="ll-scene-stage"
              style={{ left: box.left, top: box.top, width: box.width, height: box.height, backgroundImage: pickSrc(scene, season, box.width) }}
            >
              {pinsInBand && pins ? (
                <div className="ll-scene-pins" style={{ transform: `scale(${box.scale})` }}>
                  {pins}
                </div>
              ) : null}
            </div>
            {snowOn ? <div className="ll-snow" aria-hidden /> : null}
          </div>
          <div className="relative flex-1 bg-snow">{children}</div>
        </Root>
      </SceneContext.Provider>
    )
  }

  const h = elementH
  const box = contain ? containBox(w, h) : coverBox(w, h)
  const src = pickSrc(scene, season, box.width)
  return (
    <SceneContext.Provider value={{ layout, scale: box.scale, view: visible(box, w, h) }}>
      <Root ref={ref} className={cn('ll-scene', className)} style={style}>
        {/* The screen's own UI comes first so it is read first; it sits above the picture. It lets taps
            through to the pins; UI that should catch taps sets pointer-events-auto. */}
        <div className="pointer-events-none absolute inset-0 z-[2]">{children}</div>
        {contain ? <div className="ll-scene-backdrop" aria-hidden style={{ backgroundImage: `url(${sceneUrl(scene, season, true)})` }} /> : null}
        <div
          className={cn('ll-scene-stage', contain && 'll-scene-stage-contained')}
          style={{ left: box.left, top: box.top, width: box.width, height: box.height, backgroundImage: src }}
        >
          {pins ? (
            <div className="ll-scene-pins" style={{ transform: `scale(${box.scale})` }}>
              {pins}
            </div>
          ) : null}
        </div>
        {snowOn ? <div className="ll-snow z-[1]" aria-hidden /> : null}
      </Root>
    </SceneContext.Provider>
  )
}

/** Something placed on the picture, in 1366×1024 design pixels. */
export function ScenePin({
  x,
  y,
  w,
  h,
  className,
  style,
  children,
}: {
  x: number
  y: number
  w?: number
  h?: number
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  return (
    <div className={className} style={{ position: 'absolute', pointerEvents: 'auto', left: x, top: y, width: w, height: h, ...style }}>
      {children}
    </div>
  )
}
