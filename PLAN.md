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

### Phase 3: Coloring engine (core)
- Full-screen editor from a tapped page; layered canvas with line art always on top
- Pressure-sensitive pencil, pen-only palm rejection, eraser, bucket fill, undo/redo, pinch-zoom/pan
- Palette + picker, size/opacity, auto-save per child/page, colored pages render in the flip book

### Phase 4: Advanced tools & assists
- Crayon, colored pencil, marker, watercolor, glitter brushes; gradient fill; eyedropper
- Stay-in-the-lines, themed palettes, color-harmony suggestions, recent colors, page completion, left-handed toolbar

### Phase 5: Analytics, gallery & achievements
- Event tracking; personal dashboard charts; parent view per child; admin view across accounts on the device
- My Art gallery, badges and streaks

### Phase 6: PDF import, ambience, offline & polish
- Admin PDF import (split pages, mark covers, convert to line art)
- Fireplace ambience, crayon sounds, snowfall on the Christmas book
- PWA install + offline, iPad performance pass, accessibility pass, production build
