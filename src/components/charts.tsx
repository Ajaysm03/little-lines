import { useState } from 'react'
import { hexToRgb, mix } from '../coloring/colors'
import { cn } from './ui'

/**
 * Small single-series charts in plain HTML. Specs: columns at most 24px wide
 * with a 4px rounded top and square base on one hairline baseline; values in
 * text colors, never the bar color; selective labels; a tooltip on hover and
 * keyboard focus; and every number also in a table under "See the numbers".
 */

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

/** The color darkened just enough to reach 3:1 against the chart surface (light crayons like sunflower). */
export function chartTone(hex: string, surface = '#ffffff'): string {
  let c = hex
  for (let t = 0.1; contrast(c, surface) < 3 && t <= 0.8; t += 0.1) c = mix(hex, '#1b1e45', t)
  return c
}

export interface ColumnDatum {
  key: string
  /** Axis label under the column, e.g. "Mon". */
  label: string
  value: number
  /** Value as text, e.g. "12 min". */
  display: string
  /** Full description for the tooltip and table, e.g. "Monday 23 November". */
  name: string
}

export function ColumnChart({
  data,
  color,
  highlight,
  height = 150,
  caption,
}: {
  data: ColumnDatum[]
  color: string
  /** Key of the column to label and stress (e.g. today). */
  highlight?: string
  height?: number
  /** What the chart shows, for screen readers and the table. */
  caption: string
}) {
  const [hover, setHover] = useState<string | null>(null)
  const max = Math.max(...data.map((d) => d.value), 0)
  const tone = chartTone(color)
  const top = data.reduce<ColumnDatum | null>((best, d) => (d.value > (best?.value ?? 0) ? d : best), null)
  const labelled = new Set([highlight, top?.key].filter(Boolean) as string[])
  const plot = height - 22 // room for a value label above the tallest column

  return (
    <figure className="w-full">
      <div className="relative" style={{ height }} role="img" aria-label={caption}>
        <div className="absolute inset-x-0 bottom-0 flex h-full items-end">
          {data.map((d, i) => {
            // Tooltips at either end lean inward so they stay inside the chart.
            const edge = i < 1 ? 'left-0' : i >= data.length - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2'
            const h = max > 0 ? Math.max(d.value > 0 ? 3 : 0, (d.value / max) * plot) : 0
            const active = hover === d.key
            return (
              <button
                key={d.key}
                type="button"
                aria-label={`${d.name}: ${d.display}`}
                onPointerEnter={() => setHover(d.key)}
                onPointerLeave={() => setHover((k) => (k === d.key ? null : k))}
                onFocus={() => setHover(d.key)}
                onBlur={() => setHover(null)}
                className="relative flex h-full flex-1 flex-col items-center justify-end outline-offset-0 focus-visible:rounded-md"
              >
                {labelled.has(d.key) && d.value > 0 ? (
                  <span className="mb-1 text-[0.75rem] font-semibold whitespace-nowrap text-graphite">{d.display}</span>
                ) : null}
                <span
                  className="block w-[min(24px,60%)] rounded-t-[4px] transition-[filter] duration-150"
                  style={{
                    height: h,
                    backgroundColor: d.key === highlight || !highlight ? tone : mix(tone, '#ffffff', 0.35),
                    filter: active ? 'brightness(1.12)' : undefined,
                  }}
                />
                {active ? (
                  <span
                    role="tooltip"
                    className={cn(
                      'pointer-events-none absolute z-10 rounded-lg bg-ink-deep px-2.5 py-1.5 text-left text-[0.8125rem] whitespace-nowrap text-white shadow-lift',
                      edge,
                    )}
                    style={{ bottom: Math.min(h + 8, height - 8) }}
                  >
                    <span className="block font-semibold">{d.display}</span>
                    <span className="block text-white/75">{d.name}</span>
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      <div className="flex border-t border-mist pt-1.5">
        {data.map((d) => (
          <span
            key={d.key}
            className={cn('flex-1 text-center text-[0.75rem]', d.key === highlight ? 'font-bold text-ink-deep' : 'text-graphite')}
          >
            {d.label}
          </span>
        ))}
      </div>
      <NumbersTable caption={caption} rows={data.map((d) => [d.name, d.display])} />
    </figure>
  )
}

/** Horizontal bars for a ranked list (e.g. most-opened pages). */
export function BarList({
  rows,
  color,
  caption,
}: {
  rows: Array<{ key: string; label: string; value: number; display: string }>
  color: string
  caption: string
}) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  const tone = chartTone(color)
  return (
    <figure>
      <ul className="flex flex-col gap-3" aria-label={caption}>
        {rows.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
            <span className="truncate text-[0.9375rem] text-ink-deep">{r.label}</span>
            <span className="flex items-center gap-2">
              <span
                className="block h-4 max-h-6 rounded-r-[4px]"
                style={{ width: `${Math.max(2, (r.value / max) * 80)}%`, backgroundColor: tone }}
                title={`${r.label}: ${r.display}`}
              />
              <span className="shrink-0 text-[0.8125rem] font-semibold text-graphite">{r.display}</span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

export function NumbersTable({ caption, rows }: { caption: string; rows: Array<[string, string]> }) {
  return (
    <details className="mt-2 text-[0.875rem]">
      <summary className="inline-flex min-h-9 cursor-pointer items-center rounded-full px-2 font-semibold text-ink hover:bg-frost">
        See the numbers
      </summary>
      <table className="mt-2 w-full max-w-sm text-left">
        <caption className="sr-only">{caption}</caption>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-frost">
              <th scope="row" className="py-1 pr-4 font-normal text-graphite">
                {k}
              </th>
              <td className="py-1 font-semibold text-ink-deep">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
