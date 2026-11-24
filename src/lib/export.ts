import { loadImage } from '../coloring/load-regions'

/**
 * Builds the finished picture at full size: paper, the child's coloring, then
 * the line art on top, and hands it to the browser as a PNG download.
 */
export async function downloadPicture(opts: {
  colorLayer: Blob | null
  lineArt: string
  width: number
  height: number
  fileName: string
}): Promise<void> {
  const canvas = document.createElement('canvas')
  canvas.width = opts.width
  canvas.height = opts.height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fffefb'
  ctx.fillRect(0, 0, opts.width, opts.height)
  if (opts.colorLayer) {
    const url = URL.createObjectURL(opts.colorLayer)
    try {
      ctx.drawImage(await loadImage(url), 0, 0, opts.width, opts.height)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
  ctx.drawImage(await loadImage(opts.lineArt), 0, 0, opts.width, opts.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the picture'))), 'image/png'),
  )
  canvas.width = canvas.height = 0
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = opts.fileName.replace(/[\\/:*?"<>|]+/g, '') + '.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
