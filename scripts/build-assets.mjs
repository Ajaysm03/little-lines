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
 *
 * It also builds the cozy-redesign scenes and avatars from ../Redesign Concepts/Plates:
 *   public/scenes/winter/<scene>.webp (2000 px wide) and <scene>-1200.webp
 *   public/avatars/<animal>.webp      round clay animals cut from the avatar sheet
 *
 *   npm run assets:scenes   only the scenes and avatars (quick)
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
    season: 'winter',
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

// ---------- Cozy redesign: scenes and avatars ----------

const PLATES_DIR = path.join(ART_DIR, 'Redesign Concepts', 'Plates')

/** Scene name → plate file, per season. Add spring/summer/autumn sets here as they are made. */
const SCENES = {
  winter: {
    login: 'plate-login.webp',
    home: 'plate-home.webp',
    book: 'plate-book.webp',
    reader: 'plate-reader.webp',
    profiles: 'plate-profiles.webp',
    library: 'plate-library.webp',
    myart: 'plate-myart.webp',
    grownups: 'plate-grownups.webp',
    studio: 'plate-studio.webp',
  },
}

/** The avatar sheet: a 4×3 grid of round clay animals on cream (centers measured on the 2000×1493 sheet). */
const AVATAR_SHEET = 'avatars.webp'
const AVATAR_GRID = {
  ids: ['fox', 'bear', 'bunny', 'owl', 'reindeer', 'hedgehog', 'penguin', 'cat', 'puppy', 'panda', 'frog', 'unicorn'],
  xs: [292, 764, 1236, 1708],
  ys: [274, 747, 1221],
  radius: 191,
  sheetWidth: 2000,
}
const AVATAR_SIZE = 256

async function buildScenes() {
  for (const [season, scenes] of Object.entries(SCENES)) {
    const out = path.join(APP_DIR, 'public', 'scenes', season)
    await mkdir(out, { recursive: true })
    for (const [name, file] of Object.entries(scenes)) {
      const src = path.join(PLATES_DIR, file)
      // 4:3 at 2000 px; plates that come back a little off are center-cropped to 4:3.
      await sharp(src).resize(2000, 1500, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(out, `${name}.webp`))
      await sharp(src).resize(1200, 900, { fit: 'cover' }).webp({ quality: 78 }).toFile(path.join(out, `${name}-1200.webp`))
      process.stdout.write(`  scene ${season}/${name}\n`)
    }
  }
}

async function buildAvatars() {
  const out = path.join(APP_DIR, 'public', 'avatars')
  await mkdir(out, { recursive: true })
  const src = path.join(PLATES_DIR, AVATAR_SHEET)
  const { width } = await sharp(src).metadata()
  const k = width / AVATAR_GRID.sheetWidth
  const r = Math.round(AVATAR_GRID.radius * k)
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}"><circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2 - 1}" fill="#fff"/></svg>`,
  )
  for (const [i, id] of AVATAR_GRID.ids.entries()) {
    const cx = Math.round(AVATAR_GRID.xs[i % 4] * k)
    const cy = Math.round(AVATAR_GRID.ys[Math.floor(i / 4)] * k)
    await sharp(src)
      .extract({ left: cx - r, top: cy - r, width: r * 2, height: r * 2 })
      .resize(AVATAR_SIZE, AVATAR_SIZE)
      .ensureAlpha()
      .composite([{ input: mask, blend: 'dest-in' }])
      .webp({ quality: 85 })
      .toFile(path.join(out, `${id}.webp`))
  }
  console.log(`  ${AVATAR_GRID.ids.length} avatars`)
}

const onlyScenes = process.argv.includes('scenes')

async function run() {
  if (!onlyScenes) await main()
  await buildScenes()
  await buildAvatars()
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
