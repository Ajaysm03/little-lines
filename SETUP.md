# Setting up accounts, the database and Google sign-in

Little Lines now keeps each family's account, children's profiles, coloring and progress on a server:

- **Neon** (Postgres) stores everything.
- **Better Auth** (inside the app's own API) handles email/password, Google sign-in and password resets.
- **Resend** sends the "reset your password" emails.
- **Vercel** hosts the app and its API together.

Every setting goes in `.env` locally (copy `.env.example`) and in Vercel's Environment Variables in production.

---

## 0. Try it on your Mac first (no sign-ups needed)

Two terminals in the `app` folder:

```bash
npm run db:local
```

That starts a small Postgres on your Mac (data in `app/.pglite/`). Leave it running. In the second terminal:

```bash
cp .env.example .env
```

In `.env` set `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres` and a secret
(`openssl rand -base64 32` → `BETTER_AUTH_SECRET`). Then:

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:5173 and log in with the test family from `.env` (`SEED_EMAIL` / `SEED_PASSWORD`;
parent PIN `SEED_PARENT_PIN`, Leo's PIN `SEED_CHILD_PIN`). Without Resend, "Forgot password?" prints the reset
link in the `npm run dev` terminal; open it in the browser to finish the flow.

---

## 1. Connect Neon

1. Sign up at **https://neon.tech** and create a project (name it *little-lines*; pick the region nearest
   your families).
2. On the project dashboard click **Connect**. Keep branch `main`, database `neondb`, turn on
   **Connection pooling**, and copy the connection string. It looks like
   `postgresql://neondb_owner:…@ep-…-pooler.….neon.tech/neondb?sslmode=require`.
3. Put it in `.env`:

   ```
   DATABASE_URL=postgresql://neondb_owner:…@ep-…-pooler.….neon.tech/neondb?sslmode=require
   ```

4. Create the tables, then the test family:

   ```bash
   npm run db:migrate
   ```

   ```bash
   npm run db:seed
   ```

   Both are safe to run again. Run `db:migrate` after pulling app updates that change the database.
5. Restart `npm run dev`. You're now using Neon. (You can stop `npm run db:local`.)

Tip: in Neon, **Branches → Create branch** gives you a `dev` copy of the database. Use the dev branch's
connection string locally and `main` for the live site, so testing never touches real families' data.

Free-plan note: pictures are stored in the database (about 100 KB per colored page). Neon's free plan holds
0.5 GB, plenty for testing and a few hundred families; upgrade or move images to file storage later if needed.

---

## 2. Turn on Google sign-in

1. Go to **https://console.cloud.google.com**, create a project (e.g. *Little Lines*).
2. **APIs & Services → OAuth consent screen** (also called **Google Auth Platform**):
   - App name *Little Lines*, your support email, audience **External**.
   - While it's in **Testing**, only the Google accounts you add under **Test users** can sign in.
     Click **Publish app** when you go live (the basic email/profile access needs no Google review).
3. **Clients → Create client → Web application**:
   - **Authorized JavaScript origins:** `http://localhost:5173` and your live address,
     e.g. `https://little-lines.vercel.app`
   - **Authorized redirect URIs:** `http://localhost:5173/api/auth/callback/google` and
     `https://little-lines.vercel.app/api/auth/callback/google`
4. Copy the **Client ID** and **Client secret** into `.env`:

   ```
   GOOGLE_CLIENT_ID=….apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-…
   ```

5. Restart `npm run dev`. "Continue with Google" now shows on the log-in and sign-up pages. A family that signs
   up with Google picks its parent PIN right after the first sign-in. If an email/password account already uses
   the same Gmail address, Google sign-in joins that account instead of making a new one.

---

## 3. Send password-reset emails (Resend)

1. Sign up at **https://resend.com** → **API Keys → Create** and put it in `RESEND_API_KEY`.
2. **Domains → Add domain** and add the DNS records it shows at your domain host. Once verified, set
   `EMAIL_FROM=Little Lines <hello@yourdomain.com>`.
   Until then `onboarding@resend.dev` works, but only delivers to the email you signed up to Resend with.

Reset links are valid for one hour and work once. Resetting signs the family out on every other device.

---

## 4. Put it online (Vercel)

1. Push the `app` folder to a GitHub repository.
2. On **https://vercel.com → Add New → Project**, import it. If the repository root is the parent folder,
   set **Root Directory** to `app`. Vercel reads `vercel.json` (build, API function, page routing).
3. **Settings → Environment Variables:** add `DATABASE_URL` (Neon `main`), `BETTER_AUTH_SECRET` (a new one),
   `APP_URL` (e.g. `https://little-lines.vercel.app`), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
   `RESEND_API_KEY`, `EMAIL_FROM`. Don't add the `SEED_*` values to production.
4. Run `npm run db:migrate` once against the production database (temporarily point `.env` at it), then
   **Deploy**.
5. Add the live address to Google (step 2.3) if you haven't. On an iPad, open the live address in Safari and
   use **Share → Add to Home Screen**: the app installs and works offline, and syncs when back online.

---

## How the data moves

Each device keeps a full copy in the browser, so coloring works offline. Changes queue up and go to the server
about a second after they happen (and whenever the app comes back online or into view); each sync also pulls
what other devices changed. If the same thing was changed in two places, the newer change wins. The grown-ups
area shows when the family's work was last saved.

The first account ever created on the server is the **admin**: it sees *All families* in the grown-ups area.
Every family can import its own PDF books; those books sync to all of that family's devices.

Data made before this update (stored only in a browser) isn't moved to the server; families start fresh.
