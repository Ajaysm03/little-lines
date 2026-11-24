import * as pdfjs from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { colorfulness, toLineArt } from './convert'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export const PAGE_WIDTH = 1600
export const THUMB_WIDTH = 480
export const MAX_PAGES = 60

export type PdfDoc = PDFDocumentProxy

/** Opens a PDF for drawing only: no XFA forms, and pdf.js 6 never evaluates PDF content as code. */
export async function openPdf(file: File): Promise<{ doc: PdfDoc; title: string | null }> {
  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({
    data,
    enableXfa: false,
    disableFontFace: false,
    stopAtErrors: false,
  }).promise
  let title: string | null = null
  try {
    const meta = await doc.getMetadata()
    const info = meta.info as { Title?: unknown } | undefined
    if (typeof info?.Title === 'string' && info.Title.trim()) title = info.Title.trim()
  } catch {
    /* no metadata */
  }
  return { doc, title }
}

/** Draws a page onto white paper at the given width. */
export async function renderPage(doc: PdfDoc, pageNumber: number, width: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNumber)
  const base = page.getViewport({ scale: 1 })
  const viewport = page.getViewport({ scale: width / base.width })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  page.cleanup()
  return canvas
}

export interface PagePreview {
  number: number
  /** Small color preview as a data URL. */
  preview: string
  colorful: number
  aspect: number
}

/** Quick previews of every page, with a guess at which ones are painted covers. */
export async function previewPages(doc: PdfDoc, onProgress: (done: number, total: number) => void): Promise<PagePreview[]> {
  const total = Math.min(doc.numPages, MAX_PAGES)
  const out: PagePreview[] = []
  for (let n = 1; n <= total; n++) {
    const canvas = await renderPage(doc, n, 320)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    out.push({
      number: n,
      preview: canvas.toDataURL('image/jpeg', 0.8),
      colorful: colorfulness(px),
      aspect: canvas.width / canvas.height,
    })
    canvas.width = canvas.height = 0
    onProgress(n, total)
  }
  return out
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save a page image'))), type, quality),
  )
}

export function scaled(src: HTMLCanvasElement, width: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = width
  c.height = Math.round((src.height / src.width) * width)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** A cover page: full-size JPEG plus a thumbnail. Also returns its pixels for palette picking. */
export async function coverImages(doc: PdfDoc, pageNumber: number) {
  const canvas = await renderPage(doc, pageNumber, PAGE_WIDTH)
  const small = scaled(canvas, 120)
  const pixels = small.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, small.width, small.height).data
  const [image, thumb] = await Promise.all([toBlob(canvas, 'image/jpeg', 0.86), toBlob(scaled(canvas, THUMB_WIDTH), 'image/jpeg', 0.82)])
  const size = { width: canvas.width, height: canvas.height }
  canvas.width = canvas.height = 0
  return { image, thumb, pixels, size }
}

/** A coloring page: transparent PNG line art plus a thumbnail on white. */
export async function lineArtImages(doc: PdfDoc, pageNumber: number) {
  const canvas = await renderPage(doc, pageNumber, PAGE_WIDTH)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const src = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const art = ctx.createImageData(canvas.width, canvas.height)
  toLineArt(src.data, art.data)
  const thumb = await toBlob(scaled(canvas, THUMB_WIDTH), 'image/jpeg', 0.85) // still the white-paper version
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.putImageData(art, 0, 0)
  const image = await toBlob(canvas, 'image/png')
  const size = { width: canvas.width, height: canvas.height }
  canvas.width = canvas.height = 0
  return { image, thumb, size }
}
