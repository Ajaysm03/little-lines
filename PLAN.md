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

## Cozy redesign (family app)

Turns the family app into a cozy drawing-game world, following the designs on the "Little Lines Cozy Redesign"
canvas (claude.ai/artifact/Ed96njthfFcrSU2KNa3ToR, private). Scene pictures and avatars live in
`../Redesign Concepts/Plates/`, the prompts that made them in `../Redesign Concepts/Scene plate prompts.md`.

### Decisions

| Area | Decision |
|---|---|
| Look | Painted clay scenes behind every screen. Cream paper cards with washi tape hold content; chunky clay buttons (they sink 5 px when pressed) are the actions |
| Fonts | Fredoka for headings and buttons, Nunito for reading text, Pacifico for book titles, everywhere (kids and grown-ups). Shantell Sans and Atkinson Hyperlegible go |
| Colors | Base colors stay the same on every screen (paper, ink, honey, peach, wood). Each book brings its accents from its existing theme (`accent`, `deep`, `glow`, `palette`): main buttons, progress and the reader's toggles take them. The six profile crayons stay |
| Scenes | Eight 4:3 scene pictures (login desk, snowy village, book desk, reader desk, entryway, bookshop, fridge, study) as WebP backgrounds. All UI is real HTML on top, so it stays sharp, translatable and accessible. Twelve clay animal avatars replace the emoji |
| Seasons | Winter scenes now. Books get a `season` setting (owner console, default winter); the scene set follows the season and falls back to winter until other sets exist |
| Screen sizes | Tablets and desktops get the scene layouts from the designs (drawn at 1366×1024). Parts tied to something in the picture (signposts, shelves, coat hooks, the book stand, the fridge door) are placed in picture coordinates by one shared helper, so they stay put however the picture is cropped; floating panels anchor to screen edges. Phones held upright show the scene as a picture band at the top, with cards and pages stacked below |
| Owner console | Light refresh only: the new fonts and colors, same layout |
| Unchanged | Data, sync, accounts, server, emails and the coloring engine's internals |

### Phase R1: Look and building blocks ✅
- Design tokens in `index.css`: base colors, shadows, radii; `--acc` / `--acc-dk` set from the open book's theme
  (with a contrast check so text on accent buttons stays readable)
- Fonts through @fontsource (Fredoka, Nunito, Pacifico); remove Shantell Sans and Atkinson Hyperlegible
- Components: clay button (link and round versions, sizes, pressed state), paper card, tape, chip, sticker badge,
  toggle, text field, magnet, signpost label; PIN pad restyled; `Scene` (picture background, a layer placed in
  picture coordinates, the phone picture band)
- Assets: scene pictures to `public/scenes/winter/` in two sizes, avatars to `public/avatars/`, both made by
  `npm run assets`; `Avatar` shows the clay animals; service worker precaches them
- `season` on books (bundled, catalog, owner editor), default winter
- A developer-only kit page to check every component; tests for the accent and contrast helpers

- Built: Fredoka / Nunito / Pacifico replace the old fonts, and the base colors moved to warm paper and cocoa, so
  screens not yet redesigned already look warmer. `src/styles/cozy.css` (ll-* classes) and
  `src/components/cozy` (ClayButton, ClayLink, PaperCard, Tape, Chip, StatusSticker, ClayToggle, ClayField,
  Magnet, SignLabel, CrayonProgress) plus `Scene` / `ScenePin` / `useSceneLayout` (pins in 1366×1024 picture
  coordinates; upright phones get a picture band). `src/lib/accent.ts` turns a book theme into `--acc`, `--acc-dk`
  and `--on-acc`, picking white or cocoa text and deepening the color until labels pass 4.5:1. PIN pad uses clay
  dots and keys. `npm run assets:scenes` builds `public/scenes/winter/*` (2000 and 1200 px, 860 KB) and the 12
  avatars (`public/avatars`, 96 KB); profiles show the clay animals. `season` on books (bundled, catalog details,
  owner book form; default winter). Kit page at `/dev/kit` (dev server only). Offline cache is now 5.8 MB; R6 can
  leave the 2000 px scenes out of the precache

### Phase R2: Sign-in and profiles ✅
- Welcome (taped card on the pegboard), Sign up (step 1 details, step 2 parent PIN), choose a PIN after Google sign-up
- Forgot password with "Check your email", Reset password with its changed and expired states
- Who's coloring today?: name tags hanging from the entryway hooks, a lock for profiles with a PIN, "Add someone
  to color" on the bench, Grown-ups button
- Profile editor: 12 avatars, 6 clay crayons, PIN switch, live tag preview, delete for existing profiles
- Built: `AuthLayout` puts every account screen on a taped paper card over the art-desk scene (card stacked under
  the picture on upright phones); clay fields (password eye built in), clay buttons, `FormNote` for form errors,
  clay white Google button. The profile picker hangs tags on the six painted hooks (hooks 1/3/5 for up to three
  children, the middle run for more) whenever the whole row and the bench are on screen; narrower or short screens
  and phones get the same tags in a grid. Editor is one big paper card with the hanging-tag preview, clay animal
  grid, clay crayons, PIN switch and a Save button in the child's crayon (cocoa text on tangerine and sunflower).
  Dialogs are paper now. Fixed: scenes re-measure when the window changes between layouts

### Phase R3: Reading ✅
- Home in the village: greeting, "Keep coloring" card, "Your week", signposts and the Bookshop door, pages to color
  on the fence. The clay tab bar (Home, Library, My art, Grown-ups) replaces the side rail and bottom bar on kids'
  screens
- Library in the bookshop: search, filters, books on the shelves, pages on the bottom shelf, "Coming soon" slots
  while the catalog is small, Premium locks
- Book page: cover on the wooden stand, title card in the book font, chips, crayon progress, pages along the desk edge
- Reader on the desk: the existing flip book restyled, clay arrows, sound and fireplace toggles, "Color this page",
  page thumbnails on washi tape
- Built: scenes gained `fit="contain"`: the whole 4:3 picture over a blurred copy of itself, so Home, Library and
  the Book page are laid out entirely in picture pixels exactly as designed, on any window shape; below
  `minScale` (phones, landscape phones) they switch to the picture band with the same cards stacked. Clay
  `TabBar` (pins in the scene, or fixed to the bottom) replaces the side rail and bottom bar; the gallery uses the
  fixed one until R4. Home picks the page to keep coloring (most recent unfinished, else last read), the week
  chart, new-sticker note, signposts, the Bookshop doorway and three pages on the fence; the greeting avatar
  switches profile. Library: search and page-status filters on the paper sign, books on the middle shelf
  (stickers, Premium lock, "More books soon" slots while there are 3 or fewer), pages on the bottom shelf; both
  shelves scroll sideways when full. Book page: cover on the stand, Pacifico title card with chips, two-tone
  page progress, "Open the book" in the book's accent, "Color a page" for the next unfinished page, taped pages
  along the desk edge. Reader: desk scene, clay arrows and buttons in the book's accent, page pill, sound
  button, fireplace switch with a warm glow, thumbnails on rainbow washi tape. Fixed: cozy styles now sit in the
  components layer so Tailwind utilities override them; pin group wrappers no longer swallow taps

### Phase R4: My art and stickers ✅
- My art on the fridge door: pictures held by magnets, filters, picture viewer ("Keep coloring", "Save picture"),
  the "Finish a page and it hangs here" spot
- Sticker album at a new `/stickers` route (moved out of the gallery): 12 stickers, the chosen one large with how to
  earn it and progress
- Built: My art is a contained fridge scene: title strip and pictures held by magnets (three spots on the door,
  newest first, clay arrows page through older ones), status stickers, the dashed "Finish a page and it hangs
  here" spot (links to the library while the fridge is empty), the latest two stickers stuck on the door linking
  to the album, and Finished / Still coloring filters on the wall by the window. The paper picture viewer has
  "Keep coloring" (or "Color it again") and "Save picture" (shows "Saved ✓"). `/stickers` is the album open on
  the desk: progress on the left page with the chosen sticker large (how to earn it and how far along), all 12
  on the right; it starts on the sticker the child is closest to and marks new stickers as seen. The Home
  "Stickers" sign goes there; phones get stacked versions of both

### Phase R5: Coloring studio ✅
- Floating top bar: Book, title, % colored, Stay in lines, undo, redo, More, "I'm finished"
- Page fits the screen height; pinch zoom and move (the existing viewport), plus move/zoom/fit buttons
- Clay tool rack; the crayon, pencil tip, marker, brush, glitter, paint drop and dropper take the chosen color
- Size and strength by press and slide: size becomes continuous within each tool's range (today: four steps),
  remembered per child and per tool
- Colors panel that tucks into a tab; More menu (drawing sounds, fireplace, left-handed mirrors the whole layout,
  pencil only, clear page)
- "You finished it!" celebration restyled
- Tests for the size and strength mapping and the per-tool memory
- Built: the studio sits on the desk scene. On tablets and computers the chrome is drawn at iPad size and scaled
  to the window: floating top bar (Book, title with save status, % colored ring, Stay in lines switch, undo,
  redo, More, "I'm finished"), the wooden rack of clay tools (`components/studio.tsx`; crayon, marker, paint,
  fill, glitter, pencil tip and dropper take the chosen color; the chosen tool slides out), round Size and
  Strength controls you press and slide (a little slider pops up; arrow keys and [ ] work), the colors panel
  (book colors, recent, "Goes with it", any color, fill style) that tucks into a tab, and a zoom pill with
  "Move the page", zoom out, fit and zoom in. Phones get a compact top bar, a tool tray along the bottom and the
  colors as a sheet. Size is continuous within each tool's range and strength runs 15–100% in steps of 5, both
  remembered per child and per tool (`coloring/tool-settings.ts`, prefs `toolSettings`; 10 tests); the tucked
  panel is remembered per child too. More menu: drawing sounds, fireplace, left-handed (mirrors rack, panel,
  zoom and slide direction), pencil only, clear page with an inline "Clear it / Keep it". The celebration is a
  taped paper card with the page on a magnet, a "New sticker" card when one was just earned, then Next page,
  "Hang it on the fridge", Back to the book and Keep coloring. Strength stays off for glitter and the eraser,
  because the engine always draws those at full strength. Fixed along the way: the page stays mounted when the
  layout switches (rotating an iPad no longer loses the canvas), and the studio can't be scrolled sideways.
  Removed the old `coloring-ui.tsx`

### Phase R6: Grown-ups and finishing ✅
- PIN gate, Grown-ups page (children, plan, emails, account, change parent PIN), a child's insights report, 404
- Owner console light refresh
- Pass over every screen on iPad (both ways), desktop and phone; reduced motion, contrast, screen reader labels;
  offline precache size; scene pictures loaded per screen
- Built: `GrownupsFrame` puts every grown-ups screen on the sage desk scene with a clay back button. PIN gate: a
  taped paper card with the navy lock and the "Forgot it?" note. Grown-ups: "Your children" (avatar, PIN lock,
  last opened, this week, Insights and Edit for each), Add a profile, the family's books, then Plan (chip and
  days left), Emails (clay switches), Account (change parent PIN, sign out) on a second paper card; columns
  stack on narrow screens. A child's report is one big paper card of boxes: this week, all-time tiles, books
  with crayon progress, recent pictures, favorite colors and tools, stickers. 404 is a taped note in the
  village. Owner console: the new fonts and warm colors carry over and its headings were softened (not checked
  in the browser: there is no test owner). Offline cache 5.8 → 5.3 MB: only the 1200 px scenes are cached up
  front; the 2000 px ones are cached when first shown and sit over the 1200 px copy, so screens keep their
  picture offline. Every clay tone's text passes 4.5:1 (the closest is sky at 4.58); motion already stops
  for reduced motion. Checked desktop, iPad both ways and phone

### Review pass (after R6) ✅
- Code review and a WCAG 2.2 AA audit (two parallel reviewers), then fixes, checked on phone (both ways), iPad (both
  ways), laptop and desktop with an automated overlap/target-size check on every screen.
- Bugs fixed: phone layouts couldn't scroll past the first screen (PIN keys, Save, Continue unreachable); the
  studio's iPad layout covered the page on upright tablets; slider pop-ups and the More menu ran off phone screens;
  "Clear page?" stuck open; the celebration's new sticker was announced again on Home; Library and Home empty
  states; tab-bar current page for screen readers; scene pictures now refresh in the background; the dev server
  no longer exits when an idle database connection drops.
- Studio: new wood-desk background (`plate-studio.webp`); sideways phones get a side tool tray; Redo moves into
  More on narrow phones; Size and Strength are real sliders (arrow keys, Home/End) and a tap opens − / + and a
  tappable track, so no dragging is needed.
- Accessibility: Space and Enter press buttons again (studio shortcuts only fire with nothing focused), dialogs
  and the colors sheet keep focus inside and give it back, buttons stay focusable while busy, focus moves sensibly
  after menus, tucks and swapped content, one `<main>` and an `<h1>` per screen, announcements for toasts, page
  position, PIN steps and notices, readable tool labels and scene text, color names instead of hex codes, arrow
  keys in radio groups, a "Falling snow" switch in Grown-ups, and grown-ups screens stay unlocked while in use.

Each phase is checked in the browser, this file is updated, then work stops for review. Nothing is committed unless asked.

## Ideas for later (coloring)
Time-lapse replay and video export, stickers and stamps on pages, color-by-number, real-time co-coloring,
symmetry tool, cloud sync (Supabase) so families share progress across devices.
