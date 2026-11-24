# Little Lines

A coloring book app for families: a parent account with a profile for each child, books that flip like real
books, and a coloring editor built for Apple Pencil, styluses and fingers. See [PLAN.md](PLAN.md) for what each
phase added.

## Run it

Needs Node 22.13 or newer (`nvm use` picks up `.nvmrc`).

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN for tablet testing)
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run dev:https` | Same, over HTTPS with a self-signed certificate (see "Testing on an iPad") |
| `npm run build` | Type-check and production build into `dist/`, including the offline service worker |
| `npm run preview` | Serve the production build (offline mode works here) |
| `npm test` | Unit tests (Vitest + fake IndexedDB) |
| `npm run typecheck` | TypeScript check |
| `npm run assets` | Rebuild the bundled books from the art folders next to `app/` |
| `npm run icons` | Rebuild app icons from `public/favicon.svg` |

## Testing on an iPad

- **Quick look:** run `npm run dev`, then open the `Network:` address it prints (e.g. `http://192.168.1.20:5173`)
  in Safari on the same Wi-Fi. Everything works except installing and offline mode, which need HTTPS.
- **Install and offline:** these need a trusted HTTPS address. The simplest is to deploy `dist/` to any static
  host with HTTPS (Netlify, Vercel, Cloudflare Pages, GitHub Pages), open it in Safari, then
  Share → Add to Home Screen. `npm run preview:https` uses a self-signed certificate; Safari lets you continue past
  the warning, but may not enable offline mode on an untrusted certificate.

Accounts and artwork made on the iPad stay in the iPad's browser, separate from your Mac.

## Adding books

- **From the art folders (developers):** add an entry to `BOOKS` in `scripts/build-assets.mjs` pointing at the
  cover images and SVG line art, then `npm run assets`.
- **From a PDF (in the app):** sign in with the device's admin account (the first account created), open
  Grown-ups → Books on this device → Add a book from a PDF. Mark each page as cover, coloring page, back cover or
  skip; coloring pages are converted to transparent black line art and the color palette comes from the cover.
  Imported books are stored in this browser and can be removed from the same screen.

## Where data lives

Everything is stored in the browser's IndexedDB (database `little-lines`): accounts, child profiles, coloring,
the activity log behind the dashboards, and imported books. Clearing site data for the app removes all of it.
Passwords and PINs are stored as salted PBKDF2-SHA256 hashes. Device preferences (sounds, pencil-only mode,
per-child options such as stay-in-the-lines and left-handed layout) are in localStorage.

## Layout

```
scripts/                   build-assets (bundled books), build-icons
src/coloring/              editor engine: canvases, brushes, textures, fill, regions (worker), input, zoom, undo
src/components/            shared UI: flip book, charts, stickers, celebration, snowfall, coloring toolbars
src/content/               bundled book manifest, avatar and crayon options
src/data/                  IndexedDB schema and data access, stats, stickers, imported books (swap point for a backend)
src/import/                PDF reading (pdf.js) and page conversion
src/lib/                   ids, hashing, sounds, picture export, page titles
src/screens/               routes and route guards
src/state/                 Zustand stores (session, preferences, library) and live-query hooks
```

## Notes

- `npm audit` reports moderate advisories in `minimatch`, a build-time dependency of the offline-cache plugin
  (`workbox-build`). It is not part of the app that ships to the browser.
- pdf.js is pinned to 6.x: versions before 6.2.108 could run code from a malicious PDF.

## Development test account

Browser checks during development used a local-only account created in the dev browser:
`parent@example.test` / `snowfall-test-2026`, parent PIN `2468`, profile "Leo" PIN `1357`.
It exists only in that browser's IndexedDB.
