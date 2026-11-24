# Little Lines

A coloring book app for families: a parent account with a profile for each child, books that flip like real
books, and a coloring editor built for Apple Pencil, styluses and fingers. Accounts and coloring sync through a
Neon database; sign-in supports email/password, Google and password reset. See [PLAN.md](PLAN.md) for what each
phase added and **[SETUP.md](SETUP.md) for connecting Neon, Google, Resend and Vercel**.

## Run it

Needs Node 22.13 or newer (`nvm use` picks up `.nvmrc`).

```bash
npm install
npm run db:local   # terminal 1: a local Postgres (or set DATABASE_URL to Neon, see SETUP.md)
cp .env.example .env   # then fill in DATABASE_URL and BETTER_AUTH_SECRET
npm run db:seed    # creates the tables and the test family
npm run dev        # http://localhost:5173, app and API together
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run dev:https` | Same, over HTTPS with a self-signed certificate (see "Testing on an iPad") |
| `npm run build` | Type-check and production build into `dist/`, including the offline service worker |
| `npm run preview` | Serve the production build (offline mode works here) |
| `npm test` | Unit tests (Vitest + fake IndexedDB) |
| `npm run typecheck` | TypeScript check |
| `npm run db:local` | Local Postgres on port 5433 (PGlite), data in `.pglite/` |
| `npm run db:migrate` | Create or update all tables in `DATABASE_URL` |
| `npm run db:seed` | Migrate, then create the test family (from `SEED_*` in `.env`) |
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

- **Server (Neon Postgres):** Better Auth's `user`, `session`, `account`, `verification` tables, and the app's
  `app_family` (parent PIN hash, role), `app_profile`, `app_artwork`, `app_event`, `app_book`, `app_blob`
  (colored pages and imported book images). Every row belongs to one family; the API only ever reads or writes
  the signed-in family's rows.
- **Each device (IndexedDB):** a full offline copy plus an outbox of changes waiting to sync.
- Passwords are hashed by Better Auth; parent and child PINs are salted PBKDF2-SHA256 hashes.

## Layout

```
scripts/                   build-assets (bundled books), build-icons
src/coloring/              editor engine: canvases, brushes, textures, fill, regions (worker), input, zoom, undo
src/components/            shared UI: flip book, charts, stickers, celebration, snowfall, coloring toolbars
src/content/               bundled book manifest, avatar and crayon options
api/index.ts               the Vercel function: every /api request goes to server/app.ts
server/                    API routes, Better Auth config, database, email, migrations, seed, server tests
src/data/                  IndexedDB schema and data access, API client, stats, stickers, imported books
src/sync/                  outbox and two-way sync with the server
src/import/                PDF reading (pdf.js) and page conversion
src/lib/                   ids, hashing, sounds, picture export, page titles
src/screens/               routes and route guards
src/state/                 Zustand stores (session, preferences, library) and live-query hooks
```

## Notes

- `npm audit` reports moderate advisories in `minimatch`, a build-time dependency of the offline-cache plugin
  (`workbox-build`). It is not part of the app that ships to the browser.
- pdf.js is pinned to 6.x: versions before 6.2.108 could run code from a malicious PDF.

## Test account

`npm run db:seed` creates a test family from the `SEED_*` values in `.env` (defaults in `.env.example`):
the email and password to log in with, the parent PIN for the grown-ups area, and the PIN for the child profile
"Leo" ("Maya" has none).
