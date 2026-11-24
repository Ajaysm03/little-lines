import path from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { buildFillPatch, FILL_BLEED, hexToRgb } from './fill'
import { History, type Patch } from './history'
import { computeRegions, LINE_ALPHA, regionAt } from './regions'
import { clampView, fitLayout, zoomAt } from './viewport'

/** Draws a tiny page from ASCII: '#' is a line, '.' is paper. */
function page(rows: string[]) {
  const height = rows.length
  const width = rows[0].length
  const alpha = new Uint8Array(width * height)
  rows.forEach((r, y) => [...r].forEach((c, x) => (alpha[y * width + x] = c === '#' ? 255 : 0)))
  return { alpha, width, height }
}

describe('computeRegions', () => {
  const { alpha, width, height } = page([
    '..........',
    '.#####....',
    '.#...#....',
    '.#...#....',
    '.#####....',
    '..........',
  ])
  const map = computeRegions(alpha, width, height)

  it('labels lines as 0 and each enclosed area separately', () => {
    expect(map.labels[1 * width + 1]).toBe(0)
    const inside = map.labels[2 * width + 2]
    const outside = map.labels[0]
    expect(inside).toBeGreaterThan(0)
    expect(outside).toBeGreaterThan(0)
    expect(inside).not.toBe(outside)
    expect(map.sizes[inside]).toBe(6)
    expect(map.outer).toBe(outside)
  })

  it('records region bounding boxes', () => {
    const inside = map.labels[2 * width + 2]
    expect(Array.from(map.bboxes.slice(inside * 4, inside * 4 + 4))).toEqual([2, 2, 4, 3])
  })

  it('finds the nearest region when tapping a line', () => {
    const inside = map.labels[2 * width + 2]
    expect(regionAt(map, 2, 2)).toBe(inside)
    expect(regionAt(map, 1, 1, 0)).toBe(0)
    expect(regionAt(map, 1, 2, 1)).toBeGreaterThan(0)
    expect(regionAt(map, -5, 2)).toBe(0)
  })
})

describe('buildFillPatch', () => {
  it('fills the region and bleeds under adjacent lines only', () => {
    const { alpha, width, height } = page([
      '#########',
      '#.......#',
      '#.......#',
      '#########',
      '.........',
    ])
    const map = computeRegions(alpha, width, height)
    const label = map.labels[1 * width + 1]
    const patch = buildFillPatch(map, label, [255, 0, 0])!
    const at = (x: number, y: number) => patch.data[((y - patch.y) * patch.width + (x - patch.x)) * 4 + 3]
    expect(at(1, 1)).toBe(255) // inside
    expect(at(0, 1)).toBe(255) // line pixel next to the region
    expect(at(4, 3)).toBe(255)
    // The open row below the frame belongs to another region and stays untouched.
    if (4 >= patch.y && 4 < patch.y + patch.height) expect(at(4, 4)).toBe(0)
    expect(patch.x).toBe(0)
    expect(FILL_BLEED).toBeGreaterThan(0)
  })

  it('rejects invalid labels', () => {
    const { alpha, width, height } = page(['...'])
    const map = computeRegions(alpha, width, height)
    expect(buildFillPatch(map, 0, [0, 0, 0])).toBeNull()
    expect(buildFillPatch(map, 99, [0, 0, 0])).toBeNull()
  })

  it('parses hex colors', () => {
    expect(hexToRgb('#C8283A')).toEqual([200, 40, 58])
    expect(hexToRgb('fff')).toEqual([255, 255, 255])
  })
})

describe('History', () => {
  const patch = (bytes: number): Patch => {
    const img = { data: new Uint8ClampedArray(bytes / 2) } as unknown as ImageData
    return { x: 0, y: 0, before: img, after: img }
  }

  it('undoes and redoes in order and drops redo on a new step', () => {
    const h = new History()
    const a = patch(8)
    const b = patch(8)
    h.push(a)
    h.push(b)
    expect(h.undo()).toBe(b)
    expect(h.canRedo).toBe(true)
    expect(h.redo()).toBe(b)
    h.undo()
    h.push(patch(8))
    expect(h.canRedo).toBe(false)
    expect(h.size.steps).toBe(2)
  })

  it('caps steps and memory but keeps the newest step', () => {
    const h = new History(3, 100)
    for (let i = 0; i < 5; i++) h.push(patch(20))
    expect(h.size.steps).toBe(3)
    h.push(patch(500))
    expect(h.size.steps).toBe(1)
  })
})

describe('viewport', () => {
  const l = fitLayout(1000, 800, 210 / 297, 0)

  it('fits the page inside the stage', () => {
    expect(l.pageH).toBeCloseTo(800)
    expect(l.offsetX).toBeCloseTo((1000 - 800 * (210 / 297)) / 2)
  })

  it('zooms around the given point', () => {
    const v = zoomAt({ scale: 1, x: 0, y: 0 }, l, 2, 500, 400)
    // The page point that was under (500, 400) stays under it.
    const before = { x: (500 - l.offsetX) / 1, y: (400 - l.offsetY) / 1 }
    const after = { x: (500 - l.offsetX - v.x) / v.scale, y: (400 - l.offsetY - v.y) / v.scale }
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
    expect(v.scale).toBe(2)
  })

  it('snaps back to fit at scale 1 and limits panning', () => {
    expect(clampView({ scale: 0.5, x: 40, y: 40 }, l)).toEqual({ scale: 1, x: 0, y: 0 })
    const far = clampView({ scale: 2, x: 99999, y: -99999 }, l)
    expect(far.x).toBe(l.stageW / 2 - l.offsetX)
    expect(far.y).toBe(l.stageH / 2 - l.offsetY - l.pageH * 2)
  })
})

describe('Cozy Christmas line art', () => {
  it('splits a real page into many regions quickly, with the margin as the outer region', async () => {
    const file = path.resolve(__dirname, '../../public/books/cozy-christmas/pages/01-trimming-the-tree.png')
    const { data, info } = await sharp(file).extractChannel('alpha').raw().toBuffer({ resolveWithObject: true })
    const t0 = performance.now()
    const map = computeRegions(new Uint8Array(data), info.width, info.height)
    const ms = performance.now() - t0
    expect(map.count).toBeGreaterThan(200)
    expect(map.outer).toBeGreaterThan(0)
    expect(map.grid.colorable).toBeGreaterThan(map.grid.mask.length * 0.2)
    expect(LINE_ALPHA).toBeGreaterThan(0)
    expect(ms).toBeLessThan(3000)
    console.info(`regions: ${map.count - 1} in ${ms.toFixed(0)} ms; margin region ${map.outer} = ${map.sizes[map.outer]} px`)
  })
})
