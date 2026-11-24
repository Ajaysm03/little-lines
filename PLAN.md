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

### Phase 6: PDF import, ambience, offline & polish
- Admin PDF import (split pages, mark covers, convert to line art)
- Fireplace ambience, crayon sounds, snowfall on the Christmas book
- PWA install + offline, iPad performance pass, accessibility pass, production build
