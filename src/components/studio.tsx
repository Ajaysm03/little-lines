/**
 * Pieces of the cozy coloring studio (R5): clay tools that take the chosen color, the round
 * press-and-slide controls for size and strength, and the floating colors panel.
 */
import { ChevronLeft, ChevronRight, Minus, Plus, Shuffle, X } from 'lucide-react'
import { forwardRef, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { colorName, HARMONIES, hexToHsl, hslToHex, suggestColors } from '../coloring/colors'
import type { FillMode, ToolId } from '../coloring/tools'
import { FILL_MODES, TOOL_ORDER, TOOLS } from '../coloring/tools'
import { cn } from './ui'
import { ClayButton } from './cozy'
import { rovingKeys, rovingTab } from './cozy/roving'
import { textOn } from '../lib/accent'

/** Lighter and darker shades of a color for the clay highlights. */
export function shades(hex: string) {
  const [h, s, l] = hexToHsl(/^#[0-9a-f]{6}$/i.test(hex) ? hex : '#b7334b')
  return { c: hex, cL: hslToHex(h, s, Math.min(92, l + 18)), cD: hslToHex(h, s, Math.max(8, l - 18)) }
}

/** A clay drawing of a tool, 220×70; the colored parts take the chosen color. */
export function ToolArt({ tool, color, className, style }: { tool: ToolId; color: string; className?: string; style?: CSSProperties }) {
  const id = useId().replace(/:/g, '')
  const { c, cL, cD } = shades(color)
  const grad = (gid: string, stops: Array<[number, string, number?]>) => (
    <linearGradient id={`${id}${gid}`} x1="0" y1="0" x2="0" y2="1">
      {stops.map(([o, col, op], i) => (
        <stop key={i} offset={o} stopColor={col} stopOpacity={op} />
      ))}
    </linearGradient>
  )
  const u = (gid: string) => `url(#${id}${gid})`
  const tint = grad('t', [
    [0, cL],
    [0.5, c],
    [1, cD],
  ])
  let body: ReactNode
  switch (tool) {
    case 'crayon':
      body = (
        <>
          <defs>{tint}</defs>
          <rect x="0" y="16" width="158" height="38" rx="10" fill={u('t')} />
          <rect x="36" y="16" width="92" height="38" fill="#fff" opacity=".28" />
          <path d="M36 16v38M128 16v38" stroke={cD} strokeWidth="3" />
          <path d="M50 30q8 9 16 0t16 0 16 0" fill="none" stroke={cD} strokeWidth="2.5" strokeLinecap="round" opacity=".7" />
          <path d="M156 18 L200 31 Q208 35 200 39 L156 52 Z" fill={u('t')} />
          <rect x="6" y="21" width="146" height="7" rx="3.5" fill="#fff" opacity=".35" />
        </>
      )
      break
    case 'pencil':
      body = (
        <>
          <defs>
            {grad('pe', [
              [0, '#FFE08A'],
              [0.5, '#F2BE4A'],
              [1, '#C98B1E'],
            ])}
            {grad('pm', [
              [0, '#F4F4F4'],
              [0.5, '#BDBDBD'],
              [1, '#8A8A8A'],
            ])}
          </defs>
          <rect x="0" y="21" width="24" height="28" rx="9" fill="#EE9A9A" />
          <rect x="16" y="19" width="20" height="32" rx="3" fill={u('pm')} />
          <rect x="34" y="20" width="120" height="30" fill={u('pe')} />
          <path d="M34 30h120M34 40h120" stroke="#C98B1E" strokeWidth="1.5" opacity=".6" />
          <path d="M154 20 L192 33 Q196 35 192 37 L154 50 Z" fill="#EBC9A0" />
          <path d="M178 28.5 L198 34 Q201 35 198 36 L178 41.5 Z" fill={c} />
          <rect x="38" y="23" width="112" height="5" rx="2.5" fill="#fff" opacity=".45" />
        </>
      )
      break
    case 'marker':
      body = (
        <>
          <defs>
            {grad('mk', [
              [0, '#FFFFFF'],
              [0.55, '#F2EADB'],
              [1, '#CDBFA6'],
            ])}
            {tint}
          </defs>
          <rect x="0" y="15" width="134" height="40" rx="14" fill={u('mk')} />
          <rect x="86" y="15" width="34" height="40" fill={u('t')} />
          <rect x="130" y="20" width="26" height="30" rx="5" fill={u('t')} />
          <path d="M154 25 L184 31 Q192 35 184 39 L154 45 Z" fill={u('t')} />
          <rect x="8" y="20" width="110" height="6" rx="3" fill="#fff" opacity=".6" />
        </>
      )
      break
    case 'watercolor':
      body = (
        <>
          <defs>
            {grad('wd', [
              [0, '#D9A06A'],
              [0.5, '#A9703F'],
              [1, '#7A4A2A'],
            ])}
            {grad('fe', [
              [0, '#F4F4F4'],
              [0.5, '#C2C2C2'],
              [1, '#8F8F8F'],
            ])}
            {tint}
          </defs>
          <path d="M0 30 Q0 25 7 25 L122 28 L122 42 L7 45 Q0 45 0 40 Z" fill={u('wd')} />
          <rect x="120" y="23" width="30" height="24" rx="4" fill={u('fe')} />
          <path d="M148 21 C178 17 214 30 214 35 C214 40 178 53 148 49 Z" fill={u('t')} />
          <path d="M152 27 C172 25 192 30 202 34" stroke="#fff" strokeWidth="3" opacity=".35" fill="none" strokeLinecap="round" />
          <rect x="6" y="29" width="110" height="4" rx="2" fill="#fff" opacity=".3" />
        </>
      )
      break
    case 'glitter':
      body = (
        <>
          <defs>
            {grad('tb', [
              [0, '#FFFFFF', 0.95],
              [0.55, '#E9F2FA', 0.75],
              [1, '#BFD3E6', 0.9],
            ])}
          </defs>
          <rect x="0" y="22" width="26" height="26" rx="7" fill="#E98F9A" />
          <rect x="20" y="17" width="132" height="36" rx="16" fill={u('tb')} stroke="#BFD3E6" strokeWidth="2" />
          <g fill={c}>
            <circle cx="40" cy="31" r="3" />
            <circle cx="55" cy="41" r="2.5" />
            <circle cx="70" cy="28" r="3.5" />
            <circle cx="86" cy="42" r="2.5" />
            <circle cx="100" cy="31" r="3" />
            <circle cx="116" cy="41" r="3.5" />
            <circle cx="133" cy="30" r="2.5" />
          </g>
          <g fill="#F2BE4A">
            <circle cx="48" cy="43" r="2" />
            <circle cx="78" cy="36" r="2" />
            <circle cx="108" cy="25" r="2" />
            <circle cx="125" cy="45" r="2" />
          </g>
          <path d="M176 20 l4 11 11 4 -11 4 -4 11 -4-11 -11-4 11-4z" fill={c} />
          <path d="M201 42 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4-6 -6-2.4 6-2.4z" fill="#F2BE4A" />
          <circle cx="205" cy="21" r="3" fill="#F2BE4A" />
        </>
      )
      break
    case 'fill':
      body = (
        <>
          <defs>
            {grad('bk', [
              [0, '#E3F0FB'],
              [0.5, '#B9D4EE'],
              [1, '#86ABD3'],
            ])}
            {tint}
          </defs>
          <path d="M54 16 C58 2 104 2 108 16" fill="none" stroke="#7A8FA6" strokeWidth="4" strokeLinecap="round" />
          <rect x="30" y="15" width="98" height="44" rx="11" fill={u('bk')} />
          <ellipse cx="128" cy="37" rx="9" ry="22" fill={u('t')} />
          <path d="M130 45 C152 47 162 53 166 59 C172 67 162 73 154 67 C148 61 150 53 130 51 Z" fill={u('t')} />
          <circle cx="186" cy="58" r="7" fill={c} />
          <rect x="36" y="20" width="86" height="6" rx="3" fill="#fff" opacity=".55" />
        </>
      )
      break
    case 'eraser':
      body = (
        <>
          <defs>
            {grad('pk', [
              [0, '#FAC6CB'],
              [0.5, '#F0A2AA'],
              [1, '#D97884'],
            ])}
            {grad('sl', [
              [0, '#D3E6F7'],
              [0.5, '#A9C9EA'],
              [1, '#7AA3CF'],
            ])}
          </defs>
          <rect x="24" y="16" width="160" height="40" rx="11" fill={u('pk')} />
          <rect x="24" y="16" width="78" height="40" rx="11" fill={u('sl')} />
          <rect x="92" y="16" width="10" height="40" fill={u('sl')} />
          <rect x="30" y="21" width="148" height="6" rx="3" fill="#fff" opacity=".5" />
        </>
      )
      break
    case 'picker':
      body = (
        <>
          <defs>
            {grad('bl', [
              [0, '#F9B8A8'],
              [0.5, '#EE8D78'],
              [1, '#C9604B'],
            ])}
            {grad('gl', [
              [0, '#FFFFFF', 0.95],
              [0.6, '#E4EEF7', 0.8],
              [1, '#BFD3E6', 0.9],
            ])}
          </defs>
          <path d="M2 35 C2 18 16 14 32 18 L54 24 L54 46 L32 52 C16 56 2 52 2 35 Z" fill={u('bl')} />
          <rect x="52" y="22" width="16" height="26" rx="4" fill="#C9C2B5" />
          <path d="M66 26 L170 30 L192 35 L170 40 L66 44 Z" fill={u('gl')} stroke="#BFD3E6" strokeWidth="2" />
          <path d="M120 31 L170 32 L188 35 L170 38 L120 39 Z" fill={c} />
          <rect x="72" y="29" width="90" height="3" rx="1.5" fill="#fff" opacity=".8" />
          <path d="M10 26 C14 22 22 21 28 23" stroke="#fff" strokeWidth="3" opacity=".45" fill="none" strokeLinecap="round" />
        </>
      )
      break
  }
  return (
    <svg viewBox="0 0 220 70" aria-hidden className={cn('ll-tool-art', className)} style={style}>
      {body}
    </svg>
  )
}

/**
 * The tool rack. `vertical`: the tall wooden rack beside the page, tools sliding out when chosen.
 * Otherwise a scrolling row (or `column`) for small screens. `mirrored` puts the rack on the right.
 * Arrow keys move between tools; the group is one Tab stop.
 */
export function ToolRack({
  tool,
  color,
  onChange,
  vertical,
  column,
  mirrored,
}: {
  tool: ToolId
  color: string
  onChange: (t: ToolId) => void
  vertical?: boolean
  /** A narrow scrolling column of small tools (phones held sideways). */
  column?: boolean
  mirrored?: boolean
}) {
  const ink = textOn(color)
  return (
    <div
      role="radiogroup"
      aria-label="Tools"
      onKeyDown={rovingKeys}
      className={vertical ? 'relative' : column ? 'll-strip flex flex-col gap-1 overflow-y-auto px-1.5 py-2' : 'll-strip flex gap-1 overflow-x-auto px-2 pt-2 pb-1'}
    >
      {vertical ? <div aria-hidden className={cn('ll-rack', mirrored ? 'right-[14px]' : 'left-[14px]')} /> : null}
      {TOOL_ORDER.map((id, i) => {
        const on = id === tool
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={`${TOOLS[id].label} (${TOOLS[id].shortcut.toUpperCase()})`}
            onClick={() => onChange(id)}
            className={cn('ll-tool', vertical ? 'll-tool-v' : 'll-tool-h', on && 'll-tool-on', mirrored && 'll-tool-mirror')}
            style={vertical ? { top: 12 + i * 84, [mirrored ? 'right' : 'left']: 0 } : undefined}
          >
            <ToolArt tool={id} color={color} />
            <span className="ll-tool-label" style={on ? { background: color, color: ink } : undefined}>
              {TOOLS[id].label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * A round clay control for a number (size, strength). Press and slide sideways to change it, or tap
 * it to open a little slider with − and + buttons and a track you can tap. It is a keyboard slider
 * too: arrow keys, Home and End.
 */
export function SlideControl({
  label,
  value,
  min,
  max,
  fraction,
  display,
  color,
  disabled,
  onSlide,
  onStep,
  onSet,
  lessLabel,
  moreLabel,
  preview,
  hint,
  size = 80,
  popAbove,
  mirrored,
}: {
  label: string
  value: number
  min: number
  max: number
  fraction: number
  display: string
  color: string
  disabled?: boolean
  /** Called with how far (CSS px) the press has slid and the value when it started. */
  onSlide: (start: number, dx: number) => void
  onStep: (dir: 1 | -1) => void
  /** Set a value directly (tapping the track, Home and End). */
  onSet: (value: number) => void
  lessLabel: string
  moreLabel: string
  preview: ReactNode
  hint?: ReactNode
  size?: number
  /** Small screens: the slider pops up above the control, kept inside the window. */
  popAbove?: boolean
  mirrored?: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; start: number; scale: number; moved: boolean } | null>(null)
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<CSSProperties | undefined>(undefined)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(hideTimer.current), [])
  // Close when tapping anywhere else.
  useEffect(() => {
    if (!open) return
    const onDown = (e: globalThis.PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open])

  function show(stay = 6000) {
    clearTimeout(hideTimer.current)
    if (popAbove && knob.current) {
      const r = knob.current.getBoundingClientRect()
      const w = Math.min(380, window.innerWidth - 24)
      setPlace({ position: 'fixed', width: w, bottom: window.innerHeight - r.top + 12, left: Math.max(12, Math.min(r.left, window.innerWidth - w - 12)) })
    }
    setOpen(true)
    const hide = () => {
      // Stay open while keyboard focus is on the − or + button.
      if (root.current?.contains(document.activeElement) && document.activeElement !== knob.current) hideTimer.current = setTimeout(hide, 2000)
      else setOpen(false)
    }
    hideTimer.current = setTimeout(hide, stay)
  }
  function down(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return
    e.currentTarget.setPointerCapture(e.pointerId)
    // Controls can sit inside scaled chrome; measure in the control's own pixels.
    const r = e.currentTarget.getBoundingClientRect()
    drag.current = { x: e.clientX, start: value, scale: r.width / e.currentTarget.offsetWidth || 1, moved: false }
    show(60_000)
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / d.scale
    if (Math.abs(dx) > 4) d.moved = true
    if (d.moved) onSlide(d.start, dx)
  }
  function up() {
    if (!drag.current) return
    drag.current = null
    show() // a tap leaves the slider open to use; a slide hides it a little later
  }
  function key(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const dir = ({ ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 } as Record<string, 1 | -1>)[e.key]
    if (dir) onStep(dir)
    else if (e.key === 'Home') onSet(min)
    else if (e.key === 'End') onSet(max)
    else return
    e.preventDefault()
    show(1500)
  }
  function tapTrack(e: PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    let f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    if (mirrored) f = 1 - f
    onSet(min + f * (max - min))
    show()
  }

  const pop = (
    <div className={cn('ll-pop', mirrored && 'flex-row-reverse', popAbove && 'z-30')} style={popAbove ? place : undefined}>
      <ClayButton round diameter={44} tone="cream" aria-label={lessLabel} disabled={disabled || value <= min} onClick={() => (onStep(-1), show())}>
        <Minus className="size-5" strokeWidth={3} aria-hidden />
      </ClayButton>
      <div aria-hidden className="relative h-[30px] min-w-0 flex-1 cursor-pointer touch-none" onPointerDown={tapTrack} style={mirrored ? { transform: 'scaleX(-1)' } : undefined}>
        <div className="absolute inset-x-0 top-[13px] h-[5px] rounded-sm bg-mist" />
        <div className="absolute top-[13px] left-0 h-[5px] rounded-sm" style={{ width: `${fraction * 100}%`, background: color }} />
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f} className="absolute top-2 h-[15px] w-0.5 -translate-x-px rounded-sm bg-[#cdb68f]" style={{ left: `${f * 100}%` }} />
        ))}
        <span
          className="absolute top-[3px] size-6 -translate-x-3 rounded-full"
          style={{ left: `${fraction * 100}%`, background: color, boxShadow: '0 0 0 4px #fffdf8, 0 3px 6px rgb(50 25 10 / 0.4)' }}
        />
      </div>
      <ClayButton round diameter={44} tone="cream" aria-label={moreLabel} disabled={disabled || value >= max} onClick={() => (onStep(1), show())}>
        <Plus className="size-5" strokeWidth={3} aria-hidden />
      </ClayButton>
      <span className="w-[58px] shrink-0 text-center font-display text-[20px] leading-none font-semibold text-ink-deep">{display}</span>
    </div>
  )

  return (
    <div ref={root} className={cn('relative flex items-center gap-4', mirrored && 'flex-row-reverse')}>
      <div
        ref={knob}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={display}
        aria-orientation="horizontal"
        aria-disabled={disabled || undefined}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className="ll-ctl"
        style={{ width: size, height: size }}
      >
        {preview}
      </div>
      {open && !disabled ? (popAbove ? pop : <div className="w-[360px]">{pop}</div>) : hint ? <span className="ll-ctl-hint">{hint}</span> : null}
    </div>
  )
}

function Swatch({
  color,
  on,
  label,
  onPick,
  small,
  radio = true,
  tabIndex,
}: {
  color: string
  on: boolean
  label: string
  onPick: () => void
  small?: boolean
  radio?: boolean
  tabIndex?: number
}) {
  return (
    <button
      type="button"
      role={radio ? 'radio' : undefined}
      aria-checked={radio ? on : undefined}
      aria-label={label}
      title={`${label} (${color})`}
      tabIndex={tabIndex}
      onClick={onPick}
      className={cn('ll-sw', small && 'll-sw-sm', on && 'll-sw-on', isLight(color) && 'll-sw-light')}
      style={{ background: color }}
    />
  )
}

/** Swatches in a radio group: arrow keys move between them, the group is one Tab stop. */
function SwatchGroup({ label, colors, value, onChange, small, className }: { label: string; colors: string[]; value: string; onChange: (c: string) => void; small?: boolean; className?: string }) {
  const current = value.toLowerCase()
  const any = colors.some((c) => c.toLowerCase() === current)
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={rovingKeys} className={className}>
      {colors.map((c, i) => {
        const on = c.toLowerCase() === current
        return <Swatch key={c} color={c} small={small} on={on} label={colorName(c)} onPick={() => onChange(c)} tabIndex={rovingTab(on, i, any)} />
      })}
    </div>
  )
}

/** The colors panel: the book's colors, recent ones, colors that go with the current one, any color, fill style. */
export function ColorsPanel({
  palette,
  recent,
  value,
  onChange,
  onTuck,
  tuckLabel,
  mirrored,
  fillMode,
  onFillMode,
  showFill,
  className,
  style,
}: {
  palette: string[]
  recent: string[]
  value: string
  onChange: (c: string) => void
  onTuck: () => void
  tuckLabel: string
  mirrored?: boolean
  fillMode: FillMode
  onFillMode: (m: FillMode) => void
  showFill: boolean
  className?: string
  style?: CSSProperties
}) {
  const [rule, setRule] = useState(0)
  const extra = recent.filter((c) => !palette.some((p) => p.toLowerCase() === c)).slice(0, 5)
  const suggestions = suggestColors(value, HARMONIES[rule].id)
  const TuckIcon = mirrored ? ChevronLeft : ChevronRight
  return (
    <section aria-label="Colors" className={cn('ll-paper flex flex-col px-[22px] pt-5 pb-6', className)} style={style}>
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[26px] leading-none font-semibold text-ink-deep">Colors</h2>
        <ClayButton round diameter={48} tone="cream" aria-label={tuckLabel} onClick={onTuck} data-tuck>
          {tuckLabel.startsWith('Close') ? <X className="size-6" strokeWidth={3} aria-hidden /> : <TuckIcon className="size-7" strokeWidth={3} aria-hidden />}
        </ClayButton>
      </div>
      <SwatchGroup label="Book colors" colors={palette} value={value} onChange={onChange} className="mt-3.5 grid grid-cols-4 justify-items-center gap-3.5" />
      {extra.length ? (
        <>
          <h3 className="ll-ph mt-5">Recent</h3>
          <SwatchGroup label="Recent colors" colors={extra} value={value} onChange={onChange} small className="mt-2.5 flex flex-wrap gap-2.5" />
        </>
      ) : null}
      <div className="mt-5 flex items-center justify-between gap-2">
        <h3 className="ll-ph">Goes with it</h3>
        <button
          type="button"
          onClick={() => setRule((r) => (r + 1) % HARMONIES.length)}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[0.875rem] font-bold text-ink hover:bg-cream"
          title="Try other colors"
        >
          <Shuffle className="size-4" aria-hidden /> {HARMONIES[rule].label}
        </button>
      </div>
      <div role="group" aria-label="Suggested colors" className="mt-1.5 flex gap-2.5">
        {suggestions.map((c, i) => (
          <Swatch key={`${c}-${i}`} color={c} small radio={false} on={false} label={colorName(c)} onPick={() => onChange(c)} />
        ))}
      </div>
      <label className="ll-clay ll-tone-white ll-clay-sm relative mt-5 w-full cursor-pointer text-[21px] has-[input:focus-visible]:outline-4 has-[input:focus-visible]:outline-offset-3 has-[input:focus-visible]:outline-[#2a5689]">
        <span aria-hidden className="size-7 shrink-0 rounded-full" style={{ background: 'conic-gradient(#e0475b, #f2c230, #3ba55c, #3d8be8, #8559d9, #e0475b)' }} />
        Pick any color
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </label>
      {showFill ? (
        <>
          <h3 className="ll-ph mt-5">Fill style</h3>
          <div role="radiogroup" aria-label="Fill style" onKeyDown={rovingKeys} className="mt-2.5 flex flex-wrap gap-2">
            {FILL_MODES.map((m) => (
              <ClayButton
                key={m.id}
                role="radio"
                aria-checked={fillMode === m.id}
                tabIndex={fillMode === m.id ? 0 : -1}
                size="sm"
                tone={fillMode === m.id ? 'cran' : 'cream'}
                onClick={() => onFillMode(m.id)}
                className="!min-h-[46px] !px-3.5 !text-[19px]"
              >
                {m.label}
              </ClayButton>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}

/** The tab the colors panel tucks into: the current color and a few recent ones. */
export const ColorsTab = forwardRef<
  HTMLButtonElement,
  { color: string; recent: string[]; onOpen: () => void; mirrored?: boolean; className?: string; style?: CSSProperties }
>(function ColorsTab({ color, recent, onOpen, mirrored, className, style }, ref) {
  const Icon = mirrored ? ChevronRight : ChevronLeft
  return (
    <button ref={ref} type="button" aria-label="Open colors" onClick={onOpen} className={cn('ll-colors-tab', mirrored && 'll-colors-tab-mirror', className)} style={style}>
      <span className="ll-tab-disc" style={{ width: 52, height: 52, background: color }} />
      {recent
        .filter((c) => c !== color.toLowerCase())
        .slice(0, 3)
        .map((c) => (
          <span key={c} className="ll-tab-disc" style={{ width: 30, height: 30, background: c }} />
        ))}
      <Icon className="size-8 text-ink-deep" strokeWidth={3} aria-hidden />
    </button>
  )
})

/** A small ring that fills as the page gets colored. */
export function PctRing({ pct, size = 26 }: { pct: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="block shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(var(--ll-pine) ${pct * 3.6}deg, var(--color-mist) 0deg)`, boxShadow: `inset 0 0 0 ${size * 0.23}px #fbf5e8` }}
    />
  )
}

/** Whether a color is light enough to need dark text and a rim. */
export function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 190
}
