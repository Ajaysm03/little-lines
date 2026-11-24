export type ToolId = 'pencil' | 'brush' | 'fill' | 'eraser'
export type DrawTool = Exclude<ToolId, 'fill'>

export interface ToolSpec {
  id: ToolId
  label: string
  /** Line widths in page pixels for a 1600 px wide page: small, medium, large, extra large. */
  sizes: number[]
  defaultSize: number
  /** Width multiplier at lightest and firmest Apple Pencil / stylus pressure. */
  pressure: [min: number, max: number]
  shortcut: string
}

export const TOOLS: Record<ToolId, ToolSpec> = {
  pencil: { id: 'pencil', label: 'Pencil', sizes: [3, 6, 11, 18], defaultSize: 1, pressure: [0.3, 1.2], shortcut: 'p' },
  brush: { id: 'brush', label: 'Brush', sizes: [14, 26, 44, 72], defaultSize: 1, pressure: [0.5, 1.15], shortcut: 'b' },
  fill: { id: 'fill', label: 'Fill', sizes: [], defaultSize: 0, pressure: [1, 1], shortcut: 'f' },
  eraser: { id: 'eraser', label: 'Eraser', sizes: [16, 34, 60, 100], defaultSize: 1, pressure: [1, 1], shortcut: 'e' },
}

export const TOOL_ORDER: ToolId[] = ['pencil', 'brush', 'fill', 'eraser']

/** Width in canvas pixels for a tool, size step and page width. */
export function toolWidth(tool: ToolId, sizeIndex: number, pageWidth: number): number {
  const spec = TOOLS[tool]
  const base = spec.sizes[Math.max(0, Math.min(spec.sizes.length - 1, sizeIndex))] ?? 10
  return base * (pageWidth / 1600)
}
