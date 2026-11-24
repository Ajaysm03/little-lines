import {
  Check,
  Eraser,
  Highlighter,
  PaintBucket,
  Paintbrush,
  Pencil,
  Pipette,
  Plus,
  Shuffle,
  Sparkles,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { HARMONIES, suggestColors, type Harmony } from '../coloring/colors'
import { FILL_MODES, TOOL_ORDER, TOOLS, type FillMode, type ToolId } from '../coloring/tools'
import { cn } from './ui'

/** A crayon lying on its side, drawn to sit with the lucide icon set. */
function CrayonIcon({ className, strokeWidth = 2 }: LucideProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <g transform="rotate(-45 12 12)">
        <path d="M3.5 9h12v6h-12z" />
        <path d="M15.5 10l4.5 2-4.5 2" />
        <path d="M7 9v6M11.5 9v6" />
      </g>
    </svg>
  )
}

const ICONS: Record<ToolId, LucideIcon | typeof CrayonIcon> = {
  crayon: CrayonIcon,
  pencil: Pencil,
  marker: Highlighter,
  watercolor: Paintbrush,
  glitter: Sparkles,
  fill: PaintBucket,
  eraser: Eraser,
  picker: Pipette,
}

/** Every tool as a big, kid-sized button. Tools that put color down show the current color. */
export function ToolPicker({
  tool,
  color,
  onChange,
  direction,
}: {
  tool: ToolId
  color: string
  onChange: (t: ToolId) => void
  direction: 'row' | 'column'
}) {
  return (
    <div role="radiogroup" aria-label="Tools" className={cn('flex gap-1', direction === 'column' ? 'flex-col' : 'flex-row')}>
      {TOOL_ORDER.map((id) => {
        const Icon = ICONS[id]
        const active = tool === id
        const showsColor = id !== 'eraser' && id !== 'picker'
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(id)}
            title={`${TOOLS[id].label} (${TOOLS[id].shortcut.toUpperCase()})`}
            className={cn(
              'relative flex shrink-0 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[0.75rem] font-semibold transition-[background-color,color,transform] active:scale-95',
              direction === 'column' ? 'w-16' : 'w-14',
              active ? 'bg-ink text-white shadow-lift' : 'text-graphite hover:bg-frost hover:text-ink',
            )}
          >
            <Icon className="size-7" strokeWidth={active ? 2.3 : 2} />
            {TOOLS[id].label}
            {showsColor ? (
              <span aria-hidden className="absolute top-1 right-2 size-3 rounded-full ring-2 ring-white" style={{ backgroundColor: color }} />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

/** Four dots, small to large. */
export function SizePicker({
  sizes,
  value,
  onChange,
  direction,
  color,
}: {
  sizes: number[]
  value: number
  onChange: (i: number) => void
  direction: 'row' | 'column'
  color: string
}) {
  if (sizes.length === 0) return null
  const max = Math.max(...sizes)
  const labels = ['Small', 'Medium', 'Large', 'Extra large']
  return (
    <div role="radiogroup" aria-label="Size" className={cn('flex items-center gap-1', direction === 'column' ? 'flex-col' : 'flex-row')}>
      {sizes.map((s, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={labels[i] ?? `Size ${i + 1}`}
          onClick={() => onChange(i)}
          className={cn('grid size-12 shrink-0 place-items-center rounded-full transition-colors', value === i ? 'bg-frost ring-2 ring-inset ring-ink' : 'hover:bg-frost')}
        >
          <span className="rounded-full" style={{ width: 6 + (s / max) * 22, height: 6 + (s / max) * 22, backgroundColor: color }} />
        </button>
      ))}
    </div>
  )
}

/** Solid, shade (light to full) or rainbow, each shown as a little swatch. */
export function FillModePicker({
  value,
  onChange,
  color,
  direction,
}: {
  value: FillMode
  onChange: (m: FillMode) => void
  color: string
  direction: 'row' | 'column'
}) {
  const preview: Record<FillMode, string> = {
    solid: color,
    shade: `linear-gradient(180deg, color-mix(in srgb, ${color} 40%, white), ${color})`,
    rainbow: 'linear-gradient(90deg, #e0475b, #f28a2e, #f2c230, #3ba55c, #3d8be8, #8559d9)',
  }
  return (
    <div role="radiogroup" aria-label="Fill style" className={cn('flex items-center gap-1', direction === 'column' ? 'flex-col' : 'flex-row')}>
      {FILL_MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={cn(
            'flex w-16 shrink-0 flex-col items-center gap-1 rounded-2xl py-1.5 text-[0.75rem] font-semibold',
            value === m.id ? 'bg-frost text-ink ring-2 ring-inset ring-ink' : 'text-graphite hover:bg-frost',
          )}
        >
          <span className="size-7 rounded-lg ring-1 ring-black/10" style={{ background: preview[m.id] }} />
          {m.label}
        </button>
      ))}
    </div>
  )
}

export function OpacitySlider({ value, onChange, color }: { value: number; onChange: (v: number) => void; color: string }) {
  return (
    <label className="flex w-full items-center gap-3">
      <span className="shrink-0 text-[0.875rem] font-semibold text-graphite">Strength</span>
      <input
        type="range"
        min={15}
        max={100}
        step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="h-11 w-full min-w-24 cursor-pointer"
        style={{ accentColor: color }}
        aria-valuetext={`${Math.round(value * 100)}%`}
      />
    </label>
  )
}

/** "Colors that go together": five suggestions for the current color, with a button to try another rule. */
export function Suggestions({ color, onPick, layout }: { color: string; onPick: (c: string) => void; layout: 'grid' | 'row' }) {
  const [rule, setRule] = useState(0)
  const harmony: Harmony = HARMONIES[rule].id
  const colors = suggestColors(color, harmony)
  const next = () => setRule((r) => (r + 1) % HARMONIES.length)
  return (
    <div className={cn(layout === 'row' ? 'flex shrink-0 items-center gap-2' : 'flex flex-col gap-2')}>
      <div className={cn('flex items-center gap-2', layout === 'grid' && 'justify-between')}>
        <span className="text-[0.875rem] font-semibold text-graphite">
          Goes with it
        </span>
        <button
          type="button"
          onClick={next}
          className="inline-flex min-h-11 items-center gap-1 rounded-full px-2.5 text-[0.8125rem] font-semibold text-ink hover:bg-frost"
          title="Try other colors"
        >
          <Shuffle className="size-4" /> {HARMONIES[rule].label}
        </button>
      </div>
      <div role="radiogroup" aria-label="Suggested colors" className="flex gap-2">
        {colors.map((c, i) => (
          <Swatch key={`${c}-${i}`} color={c} selected={false} onPick={() => onPick(c)} small />
        ))}
      </div>
    </div>
  )
}

/** Crayon-box swatches: the book's own colors, a rainbow button for any color, and recent picks. */
export function Palette({
  colors,
  recent,
  value,
  onChange,
  layout,
  children,
}: {
  colors: string[]
  recent: string[]
  value: string
  onChange: (c: string) => void
  layout: 'grid' | 'row'
  children?: ReactNode
}) {
  const current = value.toLowerCase()
  const extra = recent.filter((c) => !colors.some((p) => p.toLowerCase() === c)).slice(0, 6)
  const swatches = (list: string[]) =>
    list.map((c) => <Swatch key={c} color={c} selected={c.toLowerCase() === current} onPick={() => onChange(c)} />)

  const custom = (
    <label
      className="relative grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-white shadow-[inset_0_0_0_2px_rgb(255_255_255/0.6)]"
      style={{ background: 'conic-gradient(#e0475b, #f2c230, #3ba55c, #3d8be8, #8559d9, #e0475b)' }}
      title="Pick any color"
    >
      <Plus className="size-5 drop-shadow" strokeWidth={3} />
      <span className="sr-only">Pick any color</span>
      <input
        type="color"
        value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      />
    </label>
  )

  if (layout === 'row') {
    return (
      <div className="flex items-center gap-2 overflow-x-auto px-3 py-2">
        {custom}
        {swatches(extra)}
        {extra.length ? <span aria-hidden className="mx-1 h-8 w-0.5 shrink-0 rounded bg-mist" /> : null}
        {swatches(colors)}
        {children ? <div className="ml-2 flex shrink-0 items-center gap-4">{children}</div> : null}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Colors" className="grid grid-cols-4 gap-2.5">
        {swatches(colors)}
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        {custom}
        {swatches(extra)}
      </div>
      {children}
    </div>
  )
}

function Swatch({ color, selected, onPick, small }: { color: string; selected: boolean; onPick: () => void; small?: boolean }) {
  const light = isLight(color)
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={color}
      onClick={onPick}
      className={cn(
        'grid shrink-0 place-items-center rounded-full transition-transform active:scale-90',
        small ? 'size-9' : 'size-11',
        light && 'ring-2 ring-inset ring-mist',
      )}
      style={{
        backgroundColor: color,
        boxShadow: selected ? `0 0 0 3px var(--color-paper), 0 0 0 6px var(--color-ink)` : 'inset 0 -4px 0 rgb(0 0 0 / 0.12)',
      }}
    >
      {selected ? <Check className={cn('size-5', light ? 'text-ink-deep' : 'text-white')} strokeWidth={3} aria-hidden /> : null}
    </button>
  )
}

export function isLight(hex: string): boolean {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return 0.299 * r + 0.587 * g + 0.114 * b > 190
}
