#!/usr/bin/env node
/**
 * App icons for the installable app (PWA) and the iPad home screen, made from
 * public/favicon.svg.
 *
 *   npm run icons
 */
import { mkdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(APP_DIR, 'public', 'icons')
const INK = '#2B2F6B'

const svg = await readFile(path.join(APP_DIR, 'public', 'favicon.svg'))
await mkdir(OUT, { recursive: true })

/** The rounded-square icon as drawn in the SVG. */
async function plain(size, name) {
  await sharp(svg, { density: (size / 64) * 72 }).resize(size, size).png().toFile(path.join(OUT, name))
}

/**
 * Maskable / Apple icons: full-bleed ink background with the artwork inside the
 * safe zone, since the platform applies its own rounded mask.
 */
async function padded(size, name, scale) {
  const inner = Math.round(size * scale)
  const art = await sharp(svg, { density: (inner / 64) * 72 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background: INK } })
    .composite([{ input: art, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT, name))
}

await plain(192, 'icon-192.png')
await plain(512, 'icon-512.png')
await padded(512, 'maskable-512.png', 0.72)
await padded(180, 'apple-touch-icon.png', 0.86)
console.log('Wrote icons to public/icons')
