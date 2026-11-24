import { cn } from './ui'

/**
 * The welcome screen's one moment of motion: a real page from Cozy Christmas
 * being colored in with crayon scribbles that stay inside the lines.
 * Scribbles sit under the line art and are clipped to each shape.
 * Coordinates are in the 480×679 thumbnail space of "Trimming the Tree".
 */

interface Region {
  id: string
  color: string
  clip: string // SVG path in thumbnail coordinates
  box: [x: number, y: number, w: number, h: number]
  step?: number
}

const REGIONS: Region[] = [
  // Tree
  { id: 'tree', color: '#3BA55C', clip: 'M236 292 L304 512 L166 512 Z', box: [160, 292, 150, 222], step: 13 },
  // Hat
  { id: 'hat', color: '#E0475B', clip: 'M68 318 C66 280 100 262 128 270 C150 278 160 300 156 318 Z', box: [60, 258, 104, 66] },
  // Scarf
  { id: 'scarf', color: '#F28A2E', clip: 'M60 352 L120 342 L132 372 L100 380 L92 466 L46 452 L70 386 Z', box: [44, 338, 92, 132] },
  // Reindeer body
  { id: 'deer', color: '#C98A55', clip: 'M300 344 C320 320 350 330 356 360 L360 392 C390 380 425 386 430 420 L424 500 L330 500 L324 410 C305 400 296 370 300 344 Z', box: [292, 318, 142, 186], step: 14 },
  // Gifts
  { id: 'gift-a', color: '#8559D9', clip: 'M168 512 L230 512 L230 558 L168 558 Z', box: [164, 508, 70, 54], step: 10 },
  { id: 'gift-b', color: '#F2C230', clip: 'M236 538 L300 538 L300 590 L236 590 Z', box: [232, 534, 72, 60], step: 10 },
  // Lantern glow
  { id: 'lantern', color: '#F2C230', clip: 'M330 504 L366 504 L366 560 L330 560 Z', box: [326, 500, 44, 64], step: 9 },
]

/** Back-and-forth crayon strokes across a box, drawn as one continuous path. */
function scribble([x, y, w, h]: Region['box'], step = 12): string {
  let d = `M${x} ${y}`
  let row = 0
  for (let yy = y; yy <= y + h + step; yy += step, row++) {
    const right = row % 2 === 0
    const tilt = step * 0.6
    d += right
      ? ` Q${x + w * 0.5} ${yy + tilt * 0.2} ${x + w} ${yy + tilt}`
      : ` Q${x + w * 0.5} ${yy + tilt * 0.8} ${x} ${yy + tilt}`
  }
  return d
}

export function ColoringInSheet({ className }: { className?: string }) {
  return (
    <figure className={cn('relative', className)}>
      <div className="relative aspect-[480/679] overflow-hidden rounded-[6px] bg-paper shadow-paper">
        <svg viewBox="0 0 480 679" className="absolute inset-0 size-full" aria-hidden>
          <defs>
            {/* Waxy, uneven crayon edge */}
            <filter id="crayon" x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" result="noise" />
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" result="rough" />
              <feComposite in="rough" in2="noise" operator="arithmetic" k1="0" k2="1" k3="-0.25" k4="0.08" />
            </filter>
            {REGIONS.map((r) => (
              <clipPath key={r.id} id={`clip-${r.id}`}>
                <path d={r.clip} />
              </clipPath>
            ))}
          </defs>
          <g filter="url(#crayon)">
            {REGIONS.map((r, i) => (
              <path
                key={r.id}
                d={scribble(r.box, r.step)}
                clipPath={`url(#clip-${r.id})`}
                fill="none"
                stroke={r.color}
                strokeOpacity={0.88}
                strokeWidth={(r.step ?? 12) * 1.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                className="coloring-in-stroke"
                style={{ animationDelay: `${0.5 + i * 0.55}s` }}
              />
            ))}
          </g>
        </svg>
        <img
          src="/books/cozy-christmas/pages/01-trimming-the-tree.png"
          alt="A Cozy Christmas coloring page of a child trimming a tree beside a reindeer, being colored in with crayons"
          className="absolute inset-0 size-full"
          decoding="async"
        />
      </div>
      <style>{`
        .coloring-in-stroke { stroke-dasharray: 1; stroke-dashoffset: 1; animation: coloring-in 1.1s ease-in-out forwards; }
        @keyframes coloring-in { to { stroke-dashoffset: 0; } }
        @media (prefers-reduced-motion: reduce) { .coloring-in-stroke { stroke-dashoffset: 0; animation: none; } }
      `}</style>
    </figure>
  )
}
