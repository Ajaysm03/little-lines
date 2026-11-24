export interface SpreadView {
  index: number
  orientation: 'portrait' | 'landscape'
}

/**
 * Page indexes visible for a flip position. With covers shown, the front and
 * back covers sit alone and everything else pairs up: [0] [1,2] [3,4] … [last].
 */
export function visiblePages(view: SpreadView, count: number): number[] {
  if (count <= 0) return []
  const i = Math.max(0, Math.min(view.index, count - 1))
  if (view.orientation === 'portrait' || i === 0) return [i]
  const left = i % 2 === 1 ? i : i - 1
  return [left, left + 1].filter((n) => n < count)
}
