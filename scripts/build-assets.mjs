#!/usr/bin/env node
/**
 * Builds the bundled coloring books from the source art folders.
 *
 *   npm run assets
 *
 * For every book in BOOKS it writes:
 *   public/books/<id>/cover-front.webp (+ -thumb)
 *   public/books/<id>/cover-back.webp  (+ -thumb)
 *   public/books/<id>/pages/<page>.png        black line art on a transparent background
 *   public/books/<id>/thumbs/<page>.webp      small preview on white paper
 * and one manifest: src/content/generated/books.json
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ART_DIR = path.resolve(APP_DIR, '..')

/** Page size for line art: A4 ratio, sized so a full page stays light on tablet memory. */
const PAGE_W = 1600
const PAGE_H = Math.round(PAGE_W * (297 / 210)) // 2263
const COVER_W = 1600
const THUMB_W = 480

const BOOKS = [
  {
    id: 'cozy-christmas',
    title: 'Cozy Christmas',
    subtitle: 'A coloring book for kids & families',
    description:
      'Step into heart-warming Christmas scenes: trim the tree, peek inside Santa’s busy workshop, bake gingerbread cookies with Grandma and skate on a frozen pond with woodland friends.',
    ageRange: '8–12 and the whole family',
    tags: ['Christmas', 'Winter', 'Family', 'Animals'],
    theme: {
      // Pulled from the front cover art.
      accent: '#C8283A',
      deep: '#1D2F5C',
      glow: '#F2B84B',
      palette: [
        '#C8283A', '#8E1B2A', '#F06B5B', '#2F7D4F', '#1F5A3A', '#7CB66B',
        '#F2B84B', '#D98A2B', '#8A5A3B', '#5B3A29', '#F4D7B8', '#E8A98A',
        '#2E4F8C', '#7FA7D9', '#CFE3F2', '#FFFFFF', '#9AA3B5', '#3A3A44',
      ],
    },
    source: {
      dir: 'Cozy Christmas',
      frontCover: '02 Covers/Front Cover - A4 300dpi.png',
      backCover: '02 Covers/Back Cover - A4 300dpi.png',
      pages: [
        { id: '01-trimming-the-tree', title: 'Trimming the Tree', svg: '03 Interior Pages/01 Trimming the Tree.svg' },
        { id: '02-santas-workshop', title: 'Santa’s Workshop', svg: '03 Interior Pages/02 Santa’s Workshop.svg' },
        { id: '03-christmas-cookies', title: 'Christmas Cookies', svg: '03 Interior Pages/03 Christmas Cookies.svg' },
        { id: '04-skating-on-the-pond', title: 'Skating on the Pond', svg: '03 Interior Pages/04 Skating on the Pond.svg' },
      ],
    },
  },
]

async function buildCover(src, outBase) {
  const img = sharp(src).flatten({ background: '#ffffff' })
  await img.clone().resize({ width: COVER_W }).webp({ quality: 76 }).toFile(`${outBase}.webp`)
  await img.clone().resize({ width: THUMB_W }).webp({ quality: 80 }).toFile(`${outBase}-thumb.webp`)
}

/** Renders the SVG, then turns ink darkness into alpha so the lines can sit on top of any color. */
async function buildLineArt(svgPath, pngOut, thumbOut) {
  const density = (PAGE_W / 210) * 25.4 // SVG is 210mm wide
  const { data, info } = await sharp(svgPath, { density })
    .resize(PAGE_W, PAGE_H, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const rgba = Buffer.alloc(info.width * info.height * 4)
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 4) {
    let a = 255 - data[i]
    if (a < 10) a = 0 // drop faint anti-alias noise on the paper
    rgba[j + 3] = a // RGB stays 0 (pure black ink)
  }
  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: false })
    .toFile(pngOut)

  await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
    .flatten({ background: '#ffffff' })
    .resize({ width: THUMB_W })
    .webp({ quality: 82 })
    .toFile(thumbOut)
}

async function main() {
  const manifest = []
  for (const book of BOOKS) {
    const outDir = path.join(APP_DIR, 'public', 'books', book.id)
    await mkdir(path.join(outDir, 'pages'), { recursive: true })
    await mkdir(path.join(outDir, 'thumbs'), { recursive: true })
    const src = (p) => path.join(ART_DIR, book.source.dir, p)
    const url = (p) => `/books/${book.id}/${p}`

    process.stdout.write(`${book.title}: covers`)
    await buildCover(src(book.source.frontCover), path.join(outDir, 'cover-front'))
    await buildCover(src(book.source.backCover), path.join(outDir, 'cover-back'))

    const pages = [
      {
        id: 'front-cover',
        kind: 'front-cover',
        title: 'Front cover',
        image: url('cover-front.webp'),
        thumb: url('cover-front-thumb.webp'),
      },
    ]
    for (const page of book.source.pages) {
      process.stdout.write(`, ${page.title}`)
      await buildLineArt(
        src(page.svg),
        path.join(outDir, 'pages', `${page.id}.png`),
        path.join(outDir, 'thumbs', `${page.id}.webp`),
      )
      pages.push({
        id: page.id,
        kind: 'line-art',
        title: page.title,
        image: url(`pages/${page.id}.png`),
        thumb: url(`thumbs/${page.id}.webp`),
      })
    }
    pages.push({
      id: 'back-cover',
      kind: 'back-cover',
      title: 'Back cover',
      image: url('cover-back.webp'),
      thumb: url('cover-back-thumb.webp'),
    })
    process.stdout.write('\n')

    const { source: _source, ...meta } = book
    manifest.push({
      ...meta,
      origin: 'bundled',
      pageSize: { width: PAGE_W, height: PAGE_H },
      cover: url('cover-front.webp'),
      coverThumb: url('cover-front-thumb.webp'),
      pages,
    })
  }

  const manifestDir = path.join(APP_DIR, 'src', 'content', 'generated')
  await mkdir(manifestDir, { recursive: true })
  await writeFile(path.join(manifestDir, 'books.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log(`Wrote ${manifest.length} book(s) to src/content/generated/books.json`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
