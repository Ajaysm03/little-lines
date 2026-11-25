import { DRAW_TOOLS, TOOLS, type DrawTool, type ToolId } from './tools'

/**
 * Size and strength for each drawing tool, set by "press and slide" on the two round controls.
 * Size is a line width in page pixels for a 1600 px wide page (see toolWidth); strength is a percent.
 */
export interface ToolSetting {
  size: number
  strength: number
}

export type ToolSettings = Record<DrawTool, ToolSetting>

/** Smallest and largest width for each tool (page pixels at 1600 px wide). */
export const SIZE_RANGE: Record<DrawTool, [min: number, max: number]> = {
  crayon: [8, 50],
  pencil: [3, 17],
  marker: [10, 72],
  watercolor: [16, 96],
  glitter: [12, 64],
  eraser: [12, 100],
}

export const STRENGTH_RANGE: [min: number, max: number] = [15, 100]
export const STRENGTH_STEP = 5

/** How far (CSS px) a full slide from smallest to largest travels. */
export const SLIDE_SPAN = 240

/** Tools whose strength the engine uses (glitter and the eraser always go on at full strength). */
export function hasStrength(tool: ToolId): boolean {
  return tool === 'crayon' || tool === 'pencil' || tool === 'marker' || tool === 'watercolor'
}

export function hasSize(tool: ToolId): boolean {
  return (DRAW_TOOLS as string[]).includes(tool)
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

export function defaultSetting(tool: DrawTool): ToolSetting {
  const spec = TOOLS[tool]
  return { size: spec.sizes[spec.defaultSize], strength: Math.round(spec.opacity * 100) }
}

/** A child's saved settings with defaults filled in and anything out of range pulled back in. */
export function settingsFor(saved: Partial<Record<string, Partial<ToolSetting>>> | undefined): ToolSettings {
  return Object.fromEntries(
    DRAW_TOOLS.map((t) => {
      const d = defaultSetting(t)
      const s = saved?.[t]
      const [lo, hi] = SIZE_RANGE[t]
      const size = typeof s?.size === 'number' && Number.isFinite(s.size) ? clamp(Math.round(s.size), lo, hi) : d.size
      const strength =
        typeof s?.strength === 'number' && Number.isFinite(s.strength)
          ? clamp(Math.round(s.strength / STRENGTH_STEP) * STRENGTH_STEP, ...STRENGTH_RANGE)
          : d.strength
      return [t, { size, strength }]
    }),
  ) as ToolSettings
}

/**
 * Size after sliding `dx` CSS pixels from where the press started. A full SLIDE_SPAN covers the
 * tool's whole range. `mirrored` (left-handed layout) makes sliding left grow the size.
 */
export function slideSize(tool: DrawTool, start: number, dx: number, mirrored = false): number {
  const [lo, hi] = SIZE_RANGE[tool]
  const d = mirrored ? -dx : dx
  return Math.round(clamp(start + (d * (hi - lo)) / SLIDE_SPAN, lo, hi))
}

/** Strength after sliding `dx` CSS pixels, in steps of 5%. */
export function slideStrength(start: number, dx: number, mirrored = false): number {
  const [lo, hi] = STRENGTH_RANGE
  const d = mirrored ? -dx : dx
  return clamp(Math.round((start + (d * (hi - lo)) / SLIDE_SPAN) / STRENGTH_STEP) * STRENGTH_STEP, lo, hi)
}

/** One arrow-key (or bracket-key) step. Size moves a twentieth of its range, at least 1. */
export function stepSize(tool: DrawTool, size: number, dir: 1 | -1): number {
  const [lo, hi] = SIZE_RANGE[tool]
  return clamp(size + dir * Math.max(1, Math.round((hi - lo) / 20)), lo, hi)
}

export function stepStrength(strength: number, dir: 1 | -1): number {
  return clamp(strength + dir * STRENGTH_STEP, ...STRENGTH_RANGE)
}

/** 0–1 position of a size within its tool's range, for drawing the dot and the slider. */
export function sizeFraction(tool: DrawTool, size: number): number {
  const [lo, hi] = SIZE_RANGE[tool]
  return clamp((size - lo) / (hi - lo), 0, 1)
}

export function strengthFraction(strength: number): number {
  const [lo, hi] = STRENGTH_RANGE
  return clamp((strength - lo) / (hi - lo), 0, 1)
}
