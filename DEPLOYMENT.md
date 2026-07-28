# Khove — Deployment & Third-Party Configuration

Two-service architecture: **frontend** on `https://www.khove.xyz` (Vercel) and
**backend** on `https://www.api.khove.xyz` (Render). Every OAuth callback and
inbound webhook is hosted on the **backend** origin; the browser only ever lands
back on the **frontend**.

> After the monolith → two-service split, anything that used to point at the single
> Next.js origin must now point at the **backend** (`api.khove.xyz`). The 🔴 items
> below are the ones the split broke.

---

## 🔴 Clerk (dashboard)
- [ ] **Webhook endpoint** → `https://www.api.khove.xyz/api/webhooks/clerk` — signing secret must match `CLERK_WEBHOOK_SECRET`
- [ ] Subscribe events: **`user.created`, `user.updated`, `user.deleted`, `session.created`, `email.created`** (the only ones handled; the last two drive OTP / new-device / welcome emails)
- [ ] **Allowed origins** include `https://www.khove.xyz`
- [ ] Sign-in / sign-up / after-auth paths match the frontend env (`/login`, `/join`, `/`)
- [ ] Moving to a **production Clerk instance** for `khove.xyz` means new `pk_live_`/`sk_live_` + a new webhook secret → update both `.env`s and the endpoint above

## 🔴 GitHub App (Settings → your App)
- [ ] **User authorization callback URL** → `https://www.api.khove.xyz/api/integrations/github/callback`
- [ ] **Webhook URL** → `https://www.api.khove.xyz/api/webhooks/github` — secret = `GITHUB_APP_WEBHOOK_SECRET`
- [ ] **Webhook → Active** = on; subscribe **Pull requests** and **Issues** (only `pull_request` + `issues` are handled today)
- [ ] Homepage / Setup URL → `https://www.khove.xyz` (cosmetic)

## 🔴 Google Cloud (APIs & Services)
- [ ] OAuth client → **Authorized redirect URIs** → `https://www.api.khove.xyz/api/integrations/google/callback` (must exactly equal `GOOGLE_REDIRECT_URI`)
- [ ] OAuth consent screen → **Authorized domains** include `khove.xyz`
- [ ] **Calendar push webhook** — no URL field; the app calls `events.watch(address=https://www.api.khove.xyz/api/webhooks/google-calendar)` automatically. Requires:
  - [ ] **Domain verification** of `khove.xyz` in Google Search Console (DNS TXT) — a domain property covers `www.api.khove.xyz`
  - [ ] Same domain added under **Cloud Console → Domain verification** for the project
  - [ ] HTTPS with a valid cert (Render provides this)
  - _Until verified: initial sync works, but no live incremental updates._

## Inngest Cloud
- [ ] App **serve URL** → `https://www.api.khove.xyz/api/inngest`
- [ ] `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` set on the backend (do **not** set `INNGEST_DEV` in production)

## Resend
- [ ] Verify sender domain **`kalaharitech.xyz`** (SPF/DKIM) — sender `noreply@kalaharitech.xyz`, reply-to `khove.io.dev@gmail.com`
- [ ] `RESEND_API_KEY` set on the backend
- _No inbound webhook needed for sending._

---

## Render (backend host)
- [ ] Custom domain **`www.api.khove.xyz`** attached, TLS issued
- [ ] **Root Directory:** repo root (blank) — npm workspaces resolve `@khove/shared` from root
- [ ] **Build Command:** `npm install --include=dev && npm run build -w khove_backend`
- [ ] **Start Command:** `npm run start -w khove_backend`
- [ ] **Health Check Path:** `/healthz`
- [ ] `NODE_VERSION=20` (or a `.node-version` file)
- [ ] All backend env vars from `khove_backend/.env.example` set in the dashboard (dashboard vars win at runtime — never ship a `.env` file)
- [ ] **Always-on** instance (not free/idle) — socket.io + agents need persistent connections

## Vercel (frontend host)
- [ ] Custom domain **`www.khove.xyz`** attached
- [ ] **Root Directory:** `khove_frontend`
- [ ] **Install Command:** `cd .. && npm install` (installs the whole workspace so the backend type-graph resolves)
- [ ] **Build Command:** `npx prisma generate --schema=../khove_backend/prisma/schema.prisma && next build`
- [ ] Env: `NEXT_PUBLIC_BACKEND_URL` / `NEXT_PUBLIC_WS_URL` = `https://www.api.khove.xyz`, plus Clerk publishable + secret + routing vars

## Data dependencies (no webhooks — confirm reachable from Render)
- [ ] **Supabase** — `DATABASE_URL` (pooler) + `DIRECT_URL`; schema pushed to the prod DB
- [ ] **Upstash Redis** — `UPSTASH_REDIS_REST_URL` + `_TOKEN`
- [ ] **Anthropic** — `ANTHROPIC_API_KEY` (until set, all AI routes fall back to Gemini Flash)

---

## ⚠️ `www` vs non-`www` — exact-match trap
Every callback/webhook is built from `BACKEND_URL` = **`https://www.api.khove.xyz`**. OAuth
`redirect_uri` and webhook signature checks are **exact-match**. If `api.khove.xyz` (no `www`)
also resolves, or a provider strips/adds `www`, the flow hard-fails. Pick one canonical host,
set it primary on Render/Vercel, 301 the other, and register only the canonical host everywhere.

## Promotion (branches)
`development` → `staging` → `production`, one-way. Prefer **fast-forward or merge commits**
over squash so the environment branches don't diverge. Redeploy Render from `production` and
re-**Sync** the Inngest app after each backend promotion.
