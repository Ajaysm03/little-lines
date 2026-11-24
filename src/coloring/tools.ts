export type BrushKind = 'crayon' | 'pencil' | 'marker' | 'watercolor' | 'glitter'
export type DrawTool = BrushKind | 'eraser'
export type ToolId = DrawTool | 'fill' | 'picker'
export type FillMode = 'solid' | 'shade' | 'rainbow'

export interface ToolSpec {
  id: ToolId
  label: string
  /** Line widths in page pixels for a 1600 px wide page: small, medium, large, extra large. */
  sizes: number[]
  defaultSize: number
  /** Width multiplier at lightest and firmest Apple Pencil / stylus pressure. */
  pressure: [min: number, max: number]
  /** Starting strength (opacity) for this tool. */
  opacity: number
  shortcut: string
}

export const TOOLS: Record<ToolId, ToolSpec> = {
  crayon: { id: 'crayon', label: 'Crayon', sizes: [12, 20, 32, 50], defaultSize: 1, pressure: [0.6, 1.15], opacity: 1, shortcut: 'c' },
  pencil: { id: 'pencil', label: 'Pencil', sizes: [4, 7, 11, 17], defaultSize: 1, pressure: [0.35, 1.2], opacity: 0.9, shortcut: 'p' },
  marker: { id: 'marker', label: 'Marker', sizes: [14, 26, 44, 72], defaultSize: 1, pressure: [0.75, 1.1], opacity: 1, shortcut: 'm' },
  watercolor: { id: 'watercolor', label: 'Paint', sizes: [22, 38, 62, 96], defaultSize: 1, pressure: [0.6, 1.2], opacity: 0.55, shortcut: 'w' },
  glitter: { id: 'glitter', label: 'Glitter', sizes: [16, 26, 42, 64], defaultSize: 1, pressure: [0.7, 1.1], opacity: 1, shortcut: 'g' },
  fill: { id: 'fill', label: 'Fill', sizes: [], defaultSize: 0, pressure: [1, 1], opacity: 1, shortcut: 'f' },
  eraser: { id: 'eraser', label: 'Eraser', sizes: [16, 34, 60, 100], defaultSize: 1, pressure: [1, 1], opacity: 1, shortcut: 'e' },
  picker: { id: 'picker', label: 'Picker', sizes: [], defaultSize: 0, pressure: [1, 1], opacity: 1, shortcut: 'i' },
}

export const TOOL_ORDER: ToolId[] = ['crayon', 'pencil', 'marker', 'watercolor', 'glitter', 'fill', 'eraser', 'picker']
export const DRAW_TOOLS: DrawTool[] = ['crayon', 'pencil', 'marker', 'watercolor', 'glitter', 'eraser']

export function isDrawTool(t: ToolId): t is DrawTool {
  return (DRAW_TOOLS as string[]).includes(t)
}

/** Tools that act on a single tap rather than a stroke. */
export function isTapTool(t: ToolId): boolean {
  return t === 'fill' || t === 'picker'
}

/** Width in canvas pixels for a tool, size step and page width. */
export function toolWidth(tool: ToolId, sizeIndex: number, pageWidth: number): number {
  const spec = TOOLS[tool]
  const base = spec.sizes[Math.max(0, Math.min(spec.sizes.length - 1, sizeIndex))] ?? 10
  return base * (pageWidth / 1600)
}

export const FILL_MODES: Array<{ id: FillMode; label: string }> = [
  { id: 'solid', label: 'Solid' },
  { id: 'shade', label: 'Shade' },
  { id: 'rainbow', label: 'Rainbow' },
]
