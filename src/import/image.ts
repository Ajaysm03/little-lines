import { PAGE_WIDTH, scaled, THUMB_WIDTH, toBlob } from './pdf'

/**
 * A new cover from a picture file (PNG, JPEG, WebP): resized like a PDF cover,
 * a thumbnail, and its pixels for picking the book's colors.
 */
export async function coverFromFile(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('Choose a PNG, JPEG or WebP picture.')
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_WIDTH
  canvas.height = Math.round((bitmap.height / bitmap.width) * PAGE_WIDTH)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const small = scaled(canvas, 120)
  const pixels = small.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, small.width, small.height).data
  const [image, thumb] = await Promise.all([toBlob(canvas, 'image/jpeg', 0.86), toBlob(scaled(canvas, THUMB_WIDTH), 'image/jpeg', 0.82)])
  canvas.width = canvas.height = 0
  return { image, thumb, pixels }
}
