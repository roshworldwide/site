# Booking setup (self-hosted, ~10 minutes)

The "Request a live demo" button and the ⌘K "Book a live demo" action open a **custom booking calendar** backed by your own Vercel serverless functions — **no Calendly/Cal.com**. Visitors see real free slots, book atomically (no double-booking), and both of you get a confirmation email with a calendar invite (`.ics`).

It stays **email-only** (the honest fallback that always works) until you finish the two setup steps below. Nothing is faked — the calendar only appears once storage **and** email are configured.

---

## What you set (Vercel → Project → Settings → Environment Variables)

| Variable | Where it comes from | Example |
|---|---|---|
| `KV_REST_API_URL` | Vercel KV store (auto-added) | `https://xxxx.kv.vercel-storage.com` |
| `KV_REST_API_TOKEN` | Vercel KV store (auto-added) | `AY...` (secret) |
| `RESEND_API_KEY` | Resend dashboard | `re_...` (secret) |
| `OWNER_EMAIL` | your inbox for notifications | `roshan@roshworldwide.com` |
| `BOOKING_TZ` | your IANA timezone | `Asia/Kolkata` |
| `MAIL_FROM` *(optional)* | a **verified** Resend sender | `Roshan Raj <roshan@roshworldwide.com>` |
| `SITE_ORIGIN` *(optional)* | your prod origin (CORS + cancel links) | `https://roshworldwide.com` |

> 🔒 Secrets live **only** in the Vercel dashboard. The code reads `process.env.*` and never hardcodes a key. Don't commit them.

---

## One-time setup

### 1. Storage — Vercel KV (free tier)
1. Vercel dashboard → **Storage → Create Database → KV** (Upstash Redis).
2. Connect it to this project. Vercel adds `KV_REST_API_URL` + `KV_REST_API_TOKEN` automatically (for all environments).

### 2. Email — Resend (free tier)
1. Sign up at **resend.com** → **API Keys → Create** → copy it into `RESEND_API_KEY`.
2. **Verify a sender:** add your domain under **Domains** and add the DNS records (recommended), then set `MAIL_FROM` to an address on it (e.g. `roshan@roshworldwide.com`).
   - For a quick test you can leave `MAIL_FROM` unset and use Resend's `onboarding@resend.dev`, but production deliverability needs your own verified domain.
3. Set `OWNER_EMAIL` and `BOOKING_TZ`.

### 3. Tune your availability
Edit [`booking.config.js`](booking.config.js) — `workingDays`, `startHour`/`endHour`, `slotMinutes`, `minHoursNotice`, `maxDaysAhead`, `blockedDates`. (No secrets in here; commit freely.)

### 4. Test locally
```bash
npm i -g vercel        # if you don't have it
vercel link            # link this folder to your Vercel project
vercel env pull        # pull the env vars you set above into .env.local
vercel dev             # serves the static site + /api on http://localhost:3000
```
Open `http://localhost:3000`, click **Request a live demo**, pick a day → a real slot loads → book it. Check both inboxes for the invite. (Add `.env.local` to `.gitignore` if it isn't already — `vercel env pull` may create it.)

### 5. Deploy
```bash
vercel --prod
```
…or just push to the git branch connected to Vercel. Done — bookings are live.

---

## How it works (so you can trust it)
- **`GET /api/availability`** computes the day's candidate slots from `booking.config.js` in your timezone, subtracts slots already in KV, and never returns past/out-of-window times.
- **`POST /api/book`** validates server-side, then **atomically** claims the slot with Redis `SET key … NX` — if two people race for the same time, exactly one wins and the other gets a clean "just taken" message. It then emails you + the visitor and attaches a real `.ics`.
- **`GET /api/cancel?token=…`** (tokenized link in the email) frees the slot and notifies you. No personal data is ever put in a URL.
- A small per-IP rate limit (KV counter) blunts abuse.

Bookings arrive by **email + calendar invite**. If you later want an admin dashboard or a Postgres mirror, that's a clean upgrade — out of scope here.
