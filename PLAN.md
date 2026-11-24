# Little Lines: build plan

A coloring book web app (installable PWA) for families. Parents sign in and add a profile for each child.
Kids browse realistic flip books, tap a page to color it full-screen with Apple Pencil, stylus or finger,
and their colored pages show up back in the book.

## Decisions

| Area | Decision |
|---|---|
| Platform | Web app / PWA: iPad + Apple Pencil, Android tablets + stylus, desktop |
| Accounts & data | Local-only prototype: IndexedDB (Dexie) in the browser. All access goes through `src/data/*` so a hosted backend (e.g. Supabase) can replace it later |
| Audience | Families: one parent account with up to 6 child profiles (avatar, crayon color, optional PIN). Parent PIN guards the grown-ups area |
| Analytics | Personal dashboard per child + parent view + admin view (first account on the device is admin) |
| Flip vs color | Flip to browse, tap a page to open full-screen coloring, colors appear in the book after |
| Content | Bundled books built from the art folders (`npm run assets`) + admin PDF import |
| Extras chosen | Stay-in-the-lines, texture brushes, gallery + achievements, sounds & cozy ambience, offline + auto-save, color suggestions |
| Later ideas | Time-lapse replay & export, stickers & stamps, color-by-number, real-time co-coloring, symmetry tool, cloud sync |

## Stack

React 19 + TypeScript + Vite, Tailwind CSS 4, React Router 7, Zustand, Dexie (IndexedDB), StPageFlip (flip book),
Canvas 2D + Pointer Events (pressure/tilt), Web Worker region map (fill + stay-in-lines), Recharts, pdf.js, vite-plugin-pwa.

## Phases

### Phase 1: Foundation & accounts ✅
- Project scaffold, design tokens (snow paper + pencil-box ink + six crayon identity colors; Shantell Sans + Atkinson Hyperlegible Next)
- Asset pipeline: SVG line art → transparent PNG + thumbnails, covers → WebP, manifest JSON
- Data layer: accounts, profiles, artworks/events tables, PBKDF2 hashing (WebCrypto with pure-JS fallback for LAN testing)
- Screens: welcome/login, sign-up (details → parent PIN), profile picker, profile editor (avatar, crayon, PIN), grown-ups area behind PIN, app shell (rail / bottom bar), home quick list, library, book detail, gallery empty state
- Unit tests for hashing, accounts, profiles, PIN cool-down

### Phase 2: Library, dashboard & realistic flip book ✅
- Flip book reader (`/books/:id/read`): page-flip with curl + shadows, hard covers, spine shading, drag/swipe, arrow keys,
  side buttons, thumbnail strip, `?page=` kept in the URL; two-page spreads on wide screens, single pages on portrait/phones
- Tap a page (or the "Color" button under the book) to open it at `/color/:book/:page` (placeholder until Phase 3)
- Page-flip sound synthesized with Web Audio, sound on/off saved per device
- Reading is logged (`book_open`, `page_turn`) so Home can "pick up where you left off"
- Home: resume card, book shelf with progress, pages-to-color quick list; Library: search, status and topic filters,
  progress badges; Book page: open-the-book button, progress, page picker
- Tests for progress roll-up, last-read lookup and spread layout

### Phase 3: Coloring engine (core) ✅
- Editor at `/color/:book/:page`: color canvas + in-progress stroke canvas under the line-art image, so lines stay on top
- Tools: pencil and brush (pressure-sensitive with Apple Pencil/stylus, smoothed curves, coalesced events), bucket fill,
  eraser; 4 sizes each, strength (opacity) slider, book palette + any-color picker + recent colors
- Region map built in a Web Worker (≈400 regions per page, ~45 ms in Node); fill bleeds 2 px under lines so no halos
- Undo/redo as pixel patches (60 steps / 64 MB cap); clear page (undoable)
- Input: one finger draws, two-finger pinch/pan, two-finger tap undo, three-finger tap redo, trackpad/wheel zoom and pan,
  zoom buttons, keyboard shortcuts; "Pencil only" palm-rejection mode that switches on the first time a pen is used
- Auto-save 1.2 s after each change, on leaving and when the tab is hidden: full-res PNG layer + 800 px thumbnail +
  progress (share of colorable area, margin excluded); a page counts as finished at 80%
- Colorings show in the flip book, on page tiles and the resume card; coloring sessions are logged for Phase 5
- Tests for region labelling (incl. a real page), fill bleed, history caps, zoom math and save/finish rules

### Phase 4: Advanced tools & assists ✅
- Eight tools: crayon, colored pencil, marker, paint (watercolor), glitter, fill, eraser, color picker
  - Crayon / pencil / paint stroke with seamless paper-grain patterns fixed to the page, so re-coloring hits the same tooth
  - Paint glazes with multiply blending and softens its edges as it "dries"; glitter scatters shaded flecks and sparkles
  - Per-tool size and strength; keyboard shortcuts C P M W G F E I
- Fill styles: solid, shade (light to full) and rainbow
- Stay in the lines (on by default, per child): every stroke, including the eraser, is clipped to the area it starts in
- Color picker samples the page and returns to the previous tool
- "Goes with it" suggestions from color-wheel rules (opposites, neighbors, triangle, light to dark)
- "I'm finished" button: saves, plays a chime, confetti, preview, and offers the next page; pages also finish by
  themselves at 80%; a child-finished page stays finished until it is cleared
- Left-handed layout (per child) in the editor's More menu, next to Clear page
- Tests for color conversion and suggestions, tool specs, and the child-finished rule

### Phase 5: Analytics, gallery & achievements ✅
- Coloring saves now also log the tools used; pure stats functions (`src/data/analytics.ts`) compute time per day,
  streaks (current and best), pages finished/started, finished books, favorite colors, sessions and page turns
- Home ("dashboard"): new-sticker banner, "Your week" panel with a minutes-per-day column chart, streak dots,
  pages finished, time this week, favorite colors, and a sticker shelf showing what to try next
- Charts follow the dataviz rules: single series, <=24 px columns with 4 px rounded tops, light crayons darkened
  to 3:1 contrast, tooltips on hover and focus, and a "See the numbers" table under every chart
- My art: a fridge-door gallery (magnets, slight tilts) with filters, a picture viewer, "Keep coloring" and
  "Save picture" (full-size PNG with paper, coloring and line art); all 12 stickers with how to earn each
- 12 stickers (first scribble, page finished, four pages, whole book, color explorer, rainbow, glitter, paint,
  3- and 7-day streaks, an hour of color, page turner), each with progress
- Grown-ups: per-child summary rows and a child insights page (week, all-time figures, books, recent pictures,
  colors and tools, stickers); admins also get device insights (families, children, active children, 14-day
  chart, most-opened pages, families table)
- Tests for day bucketing, streaks, totals, stickers and device stats

### Phase 6: PDF import, ambience, offline & polish ✅
- Admin PDF import (`/grown-ups/import`, pdf.js 6 loaded on demand): page previews, automatic guess of cover /
  coloring / back pages from how colorful they are, page titles, book details; coloring pages become transparent
  line art, the palette and theme come from the cover (k-means). Books on this device list with remove
- Imported books live in IndexedDB (v2 tables `books`, `bookFiles`) and join the bundled ones through a shared
  library store, so the reader, editor, dashboard, gallery and insights treat them the same
- Ambience: snowfall behind Christmas/winter books, a synthesized crackling fireplace (reader and editor
  toggle), scribble sounds that follow stroke speed with a tone per tool (on by default, switchable)
- Installable PWA: manifest, icons (`npm run icons`), service worker precaching the app and bundled books
  (~4.7 MB, PDF import and rare font subsets excluded); `dev:https` / `preview:https` for LAN testing
- Performance: reader, editor and import split into their own chunks; React, Dexie and pdf.js in long-lived chunks
- Accessibility: page titles on every screen, skip link, deeper green for text and labels (contrast >= 4.5:1),
  44 px tap targets on filters; animations respect reduced motion
- Node 22.13+ (pdf.js 6); tests for line-art conversion, page detection, palette and theme extraction

## After Phase 6: cloud accounts
- Neon Postgres behind a Vercel function (`api/index.ts` → `server/app.ts`); the same code runs inside the Vite
  dev server, and `npm run db:local` gives a local Postgres (PGlite) with no sign-up
- Better Auth: email/password, Google sign-in (shown when keys are set, joins same-email accounts), password
  reset by email (Resend, or the link in the terminal without a key); Forgot password, Reset password and
  "choose a parent PIN" (after Google sign-up) screens
- Two-way sync: IndexedDB stays the offline copy, an outbox sends changes (profiles, colorings and their
  images, activity, imported books), pulls bring other devices' changes, newest change wins
- Admin "All families" view from the server; any family can import PDF books into its own library
- `npm run db:migrate` / `db:seed`; integration tests run the real API against in-memory Postgres
  (sign-up, login, reset, Google redirect, sync, family isolation, admin access)
- Setup guide in SETUP.md

## Owner console (super admin)

### Decisions
- **Roles:** one *owner* (super admin: you) and *grown-ups* (each family's admin). Grown-ups can no longer import
  PDFs; only the owner adds, edits and deletes books. The old "first account is admin" rule goes away.
- **Owner login:** username or email + password. `npm run owner:create` asks for them privately in the terminal,
  so the password never appears in chat or Git.
- **Plans, no payments (for now):** Free / Trial / Premium with start and end dates, set by the owner. Premium books
  are locked for families on Free. Stripe can be added later without changing the model.
- **Book storage:** Neon (page images as compressed WebP in the database). Uploads go page by page (Vercel's
  4.5 MB request limit).
- **Old family imports** move into the catalog as drafts, keeping their ids so existing colorings still match.
- **Inactive** = no login and no coloring for 30 days. Statuses: Active, Inactive, Never started, Suspended.
- **Where:** a separate `/admin` console with a sidebar (Overview, Users, Books, Analytics, Emails, Audit log),
  only the owner can open it; works on desktop and iPad.

### Phase A: Owner account, roles & console shell ✅
- `owner` and `parent` roles; existing `admin` rows become `parent`
- Username sign-in (Better Auth username plugin); login field accepts "Email or username"
- `npm run owner:create` (hidden password prompt, works against Neon or local)
- Import removed for grown-ups (UI and API); the families' "All families" view moves to the console
- `/admin` guard and console layout; the owner lands there after login
- Audit log table: every owner action is recorded (who, what, when, before/after)
- Built: owner sign-ins are logged with IP and browser; the console has Overview (families, activity, newest
  families, recent activity) and Audit log (filters, details, older entries); Users, Books, Analytics and Emails
  show what their phase adds. Grown-ups who already imported books keep them; new ones are ignored by the server

### Phase B: Book catalog & publishing ✅
- Catalog tables (book + pages + images); Cozy Christmas listed as a built-in book
- Upload a PDF (same in-browser conversion as today), live progress, page-by-page upload
- Edit title, subtitle, description, category, age range, tags, theme; replace cover; rename, reorder and remove pages
- Draft → preview (exactly as families see it) → publish / unpublish; archive and permanent delete (typed confirm)
- Drag to reorder the library; "New" badge for 14 days after publishing; Free or Premium per book
- Families get published books from the server (cached for offline); old family imports become drafts
- Built: catalog tables and API (server/catalog.ts); console Books list (filters, drag or arrow reordering),
  Upload a PDF, book editor (details, pages, cover, Free/Premium, publish, archive, delete) and full-screen
  preview. Families load the catalog with the library (kept in localStorage); page images are cached by the
  service worker under versioned URLs. Cozy Christmas can be hidden, made Premium and reordered. Every change
  is in the audit log. Adding pages to an existing book means uploading the PDF again

### Phase C: Plans & premium books ✅
- Plan per family: Free / Trial / Premium, start and end dates, notes; trial expiry handled automatically
- New families start on a 14-day trial (changeable in settings)
- Premium books show a lock for Free families with a gentle "ask a grown-up" message; Grown-ups → Plan shows
  the family's plan and dates

- Built: plan columns on each family and a trial-length setting (server/plans.ts); families from before plans
  started a trial on migrate. Console → Plans: counts, trial length, every family's plan with a dialog to change
  it (end date, +14 days / +1 month / +1 year, note). Premium book pages are refused by the server to families on
  Free (covers stay visible); the app shows a lock on the card and the book page and sends the reader/editor back.
  Books that come with the app are only locked in the app, since their pages ship with it

### Phase D: Users & management ✅
- Users list: name, username/email, joined, last login, last coloring, status, plan and end date, children, pages
  colored; search, filters (status, plan, joined), sort, pagination, CSV export
- User detail: children, recent activity, books used; change, extend or gift a plan; suspend / reactivate (signs
  them out everywhere); send a password reset; delete account (typed confirm)
- Audit log screen with filters

- Built: server/users.ts. Console → Users (counts, search, status/plan/joined filters, five sorts, 25 per page,
  CSV of the filtered list) and a user page (children, books, recent activity, account facts, plan dialog, password
  reset, suspend with a reason, reactivate, delete with the email typed). Suspension is "user"."suspendedAt", checked
  by Better Auth on every sign-in, and signs the family out everywhere. Last sign-in is recorded from now on
  (earlier ones only survive while that session still exists)

### Phase E: Content & growth analytics ✅
- KPIs: families, new this week, daily / weekly / monthly active families, active rate, premium count, pages finished
- Charts: sign-ups over time, active families over time, coloring minutes, plan mix
- Per book: opens, pages colored, completion rate, most popular pages; date-range filter

- Built: GET /api/admin/analytics (server/analytics.ts), days in the owner's time zone. Console → Analytics: 7 days,
  30 days, 90 days (by week) or 12 months (by month); eight figures; new families, active families (average a day
  for weeks and months), coloring time, plan mix; every book with families, opens, pages started and finished,
  completion rate and coloring time; most popular pages. "Active" comes from the activity log (opening a book,
  turning pages, coloring)

### Phase F: Family emails ✅
- Welcome email on sign-up; weekly progress digest for grown-ups (Vercel Cron, Monday morning); "New book"
  announcement sent by the owner when publishing
- Grown-ups → Email settings and a one-click unsubscribe link in every email
- Console → Emails: preview, send a test to yourself, send history and counts
- Real delivery needs RESEND_API_KEY and a verified sending domain; without it emails go to the server log

- Built: server/emails.ts (templates, log, signed unsubscribe links with one-click headers, weekly summaries,
  announcements) and Resend batch sending in server/email.ts. Welcome on first sign-in; weekly summary by Vercel
  Cron (Mondays 08:00 UTC, CRON_SECRET), at most one per family per week, skipped for families with nothing to
  report; "Announce to families" in the book editor, once per family per book. Console → Emails: sending status,
  counts, previews, test to yourself, send the week's emails now, history. Grown-ups → Emails: two switches

### Ideas for later
Two-step sign-in for the owner, scheduled publishing for seasonal books, families requesting books,
a maintenance banner, Stripe payments on top of the plan model.

## Ideas for later (coloring)
Time-lapse replay and video export, stickers and stamps on pages, color-by-number, real-time co-coloring,
symmetry tool, cloud sync (Supabase) so families share progress across devices.
