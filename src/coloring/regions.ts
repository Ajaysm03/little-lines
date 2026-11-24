/**
 * Region map for a line-art page: every enclosed white area gets its own label.
 * Built once per page (in a worker) and used for bucket fill, stay-in-the-lines
 * and measuring how much of the page has been colored.
 *
 * labels[i] === 0 → pixel is part of a black line
 * labels[i]  >  0 → region id
 */
export interface RegionData {
  width: number
  height: number
  labels: Int32Array
  /** Number of regions + 1 (index 0 is "line"). */
  count: number
  /** Pixel count per region id. */
  sizes: Int32Array
  /** minX, minY, maxX, maxY per region id (4 entries each). */
  bboxes: Int32Array
  /** The page margin outside the frame; not counted towards progress. */
  outer: number
  /** Coarse grid marking colorable pixels, for fast progress checks. */
  grid: { width: number; height: number; step: number; mask: Uint8Array; colorable: number }
}

/** Line pixels: ink darker than this alpha blocks a fill. */
export const LINE_ALPHA = 110
/** Regions smaller than this are specks between lines, not things to color. */
export const MIN_REGION = 60
export const GRID_STEP = 4

export function computeRegions(alpha: Uint8Array, width: number, height: number): RegionData {
  const n = width * height
  const labels = new Int32Array(n).fill(-1)
  for (let i = 0; i < n; i++) if (alpha[i] >= LINE_ALPHA) labels[i] = 0

  let stack = new Int32Array(1 << 16)
  const sizes: number[] = [0]
  const boxes: number[] = [0, 0, 0, 0]
  let next = 1

  for (let seed = 0; seed < n; seed++) {
    if (labels[seed] !== -1) continue
    const label = next++
    let size = 0
    let minX = width,
      minY = height,
      maxX = 0,
      maxY = 0
    let sp = 0
    stack[sp++] = seed
    while (sp > 0) {
      const idx = stack[--sp]
      if (labels[idx] !== -1) continue
      const y = (idx / width) | 0
      const row = y * width
      let lx = idx - row
      let rx = lx
      while (lx > 0 && labels[row + lx - 1] === -1) lx--
      while (rx < width - 1 && labels[row + rx + 1] === -1) rx++
      for (let x = lx; x <= rx; x++) labels[row + x] = label
      size += rx - lx + 1
      if (lx < minX) minX = lx
      if (rx > maxX) maxX = rx
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      // Seed the rows above and below, one seed per run of open pixels.
      for (let ny = y - 1; ny <= y + 1; ny += 2) {
        if (ny < 0 || ny >= height) continue
        const nrow = ny * width
        let inRun = false
        for (let x = lx; x <= rx; x++) {
          if (labels[nrow + x] === -1) {
            if (!inRun) {
              if (sp >= stack.length) {
                const bigger = new Int32Array(stack.length * 2)
                bigger.set(stack)
                stack = bigger
              }
              stack[sp++] = nrow + x
              inRun = true
            }
          } else inRun = false
        }
      }
    }
    sizes.push(size)
    boxes.push(minX, minY, maxX, maxY)
  }

  // The margin is whatever region holds the most corner pixels.
  const corners = [0, width - 1, (height - 1) * width, n - 1].map((i) => labels[i]).filter((l) => l > 0)
  const outer = corners.length ? mode(corners) : -1

  const sizesArr = Int32Array.from(sizes)
  const gw = Math.ceil(width / GRID_STEP)
  const gh = Math.ceil(height / GRID_STEP)
  const mask = new Uint8Array(gw * gh)
  let colorable = 0
  for (let gy = 0; gy < gh; gy++) {
    const y = Math.min(height - 1, gy * GRID_STEP + (GRID_STEP >> 1))
    for (let gx = 0; gx < gw; gx++) {
      const x = Math.min(width - 1, gx * GRID_STEP + (GRID_STEP >> 1))
      const l = labels[y * width + x]
      if (l > 0 && l !== outer && sizesArr[l] >= MIN_REGION) {
        mask[gy * gw + gx] = 1
        colorable++
      }
    }
  }

  return {
    width,
    height,
    labels,
    count: next,
    sizes: sizesArr,
    bboxes: Int32Array.from(boxes),
    outer,
    grid: { width: gw, height: gh, step: GRID_STEP, mask, colorable },
  }
}

function mode(values: number[]): number {
  const counts = new Map<number, number>()
  let best = values[0]
  for (const v of values) {
    const c = (counts.get(v) ?? 0) + 1
    counts.set(v, c)
    if (c > (counts.get(best) ?? 0)) best = v
  }
  return best
}

/** Region under a point, or the nearest region within `radius` when the point is on a line. */
export function regionAt(map: RegionData, x: number, y: number, radius = 8): number {
  const { width, height, labels } = map
  const cx = Math.round(x)
  const cy = Math.round(y)
  if (cx < 0 || cy < 0 || cx >= width || cy >= height) return 0
  const here = labels[cy * width + cx]
  if (here > 0) return here
  // Spiral out ring by ring; take the first open pixel found.
  for (let r = 1; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const px = cx + dx
        const py = cy + dy
        if (px < 0 || py < 0 || px >= width || py >= height) continue
        const l = labels[py * width + px]
        if (l > 0) return l
      }
    }
  }
  return 0
}
