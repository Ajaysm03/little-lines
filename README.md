# Little Lines

A coloring book app for families. See [PLAN.md](PLAN.md) for the roadmap.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (also on your LAN for tablet testing)
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run assets` | Rebuilds bundled books from the art folders next to `app/` into `public/books/` and `src/content/generated/books.json` |
| `npm test` | Unit tests (Vitest + fake IndexedDB) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |

## Testing on an iPad

Run `npm run dev`, then open the `Network:` address it prints (e.g. `http://192.168.1.20:5173`) in Safari on the
iPad, on the same Wi-Fi. Accounts made on the iPad live in the iPad's browser, separate from your Mac.

## Where data lives

Everything is stored in the browser's IndexedDB (database `little-lines`). Clearing site data for the app removes
all accounts, profiles and artwork on that device. Passwords and PINs are stored as salted PBKDF2-SHA256 hashes.

The first account created in a browser becomes its admin.

## Layout

```
scripts/build-assets.mjs   art folders → app assets + manifest
src/content/               book manifest types, avatar and crayon options
src/data/                  IndexedDB schema, accounts/profiles, session storage (swap point for a backend)
src/state/                 Zustand session store and live-query hooks
src/components/            shared UI: buttons, PIN pad, dialog, avatar, book cover, welcome animation
src/screens/               routes and route guards
```

## Development test account

Browser checks during development used a local-only account created in the dev browser:
`parent@example.test` / `snowfall-test-2026`, parent PIN `2468`, profile "Leo" PIN `1357`.
It exists only in that browser's IndexedDB.
