# Khove

**AI-native orchestration for Product & Dev teams.** Khove sits *above the repo* — it turns
product intent into dispatched dev work and tracks it home across GitHub, Google Calendar, and
(planned) Jira, unified in a single **Connectivity Thread**. It is an orchestrator, **not** a
code-writer: it hands off to Cursor / Claude Code / Codex rather than competing with them.

> **Direction (V4 pivot):** conversational AI over your tools → an agentic orchestration
> platform (GitHub PR Shepherd agent, Khove-as-an-MCP-provider, agent-run metering). The shipped
> code today is the conversational layer plus the two-service backend that the agents will run
> on. See [`product_docs/`](product_docs/) for the Concept Note, Technical PRD, and cost model.

---

## Monorepo layout

Khove is an **npm-workspaces monorepo** — a Next.js frontend and an Express backend that share a
small typed package. The frontend holds **zero database access and zero secrets**; every read and
write goes through the backend over a typed tRPC client with the Clerk session token forwarded.

```
taipei/                     ← git root (github.com/Kalahari-Technologies/khove)
├── khove_frontend/         Next.js 15 (App Router, React 19) — UI only, no DB
├── khove_backend/          Express (ESM, tsx) — tRPC, Inngest, socket.io, Prisma, all lib/
├── packages/shared/        @khove/shared — RealtimeEvent, Prisma-free PLANS, design tokens, cn
├── product_docs/           Concept Note, Technical PRD, cost estimate
├── CLAUDE.md               Authoritative working guide (read this before contributing)
├── DOCUMENTATION.md        Long-form developer manual
├── package.json            Workspace root — orchestrating scripts live here
└── tsconfig.base.json      Shared TS config
```

Why two services: the V4 workloads (durable event-driven agents, an MCP server holding long-lived
connections, mem0, streaming AI, real-time push) fight Next.js's serverless request/response
model. The backend is a **persistent, independent** service; realtime is true **socket.io**
push (webhooks/mutations/agents fire WS events), replacing the old 3-second Redis/SSE poll.

---

## Stack

| Layer | Tech |
|---|---|
| **Frontend** | Next.js 15 · React 19 · TypeScript · Tailwind 3 · `motion` · socket.io-client · tRPC 11 client |
| **Backend** | Express 4 (ESM) · tRPC 11 (`@trpc/server/adapters/express`) · socket.io · Inngest 4 · Prisma 6 |
| **Data / infra** | Supabase Postgres · Upstash Redis · Clerk auth · Resend email · Octokit · googleapis |
| **AI** | Vercel AI SDK 6 (`@ai-sdk/anthropic`, `@ai-sdk/google`) — Gemini Flash / Claude Haiku / Sonnet, routed by complexity × plan tier |

---

## Prerequisites

- **Node 20+** and npm 10+ (workspaces).
- A Supabase Postgres database, an Upstash Redis instance, and a Clerk application.
- Optional for full function: Anthropic + Google AI keys, a GitHub App, Google OAuth credentials,
  a Resend key. Without `ANTHROPIC_API_KEY` the AI router falls back to Gemini Flash for everything.

---

## Getting started

```bash
# 1. Install all workspaces from the root (single lockfile)
npm install

# 2. Configure environment — copy each example and fill it in
cp khove_backend/.env.example  khove_backend/.env.local     # all secrets live here
cp khove_frontend/.env.example khove_frontend/.env.local    # NEXT_PUBLIC_* + Clerk keys only

# 3. Generate the Prisma client + push the schema
npm run db:generate
npm run db:push

# 4. Run both services (frontend :3000, backend :4000)
npm run dev
```

Then open **http://localhost:3000**. The backend API docs are at
**http://localhost:4000/docs** (raw spec at `/openapi.json`).

For local dev without Inngest signing, comment out `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY`
in `khove_backend/.env.local`, and run the Inngest dev server separately with `npm run inngest`.

---

## Root scripts

All orchestration runs from the repo root; each delegates to the relevant workspace.

| Command | Does |
|---|---|
| `npm run dev` | Both services concurrently (backend :4000 + frontend :3000) |
| `npm run dev:backend` / `dev:frontend` | Run one service |
| `npm run build` | `prisma generate` (backend) then `next build` (frontend) |
| `npm run typecheck` | `tsc --noEmit` across shared → backend → frontend |
| `npm run inngest` | Inngest dev server pointed at the backend |
| `npm run db:generate` / `db:push` / `db:migrate` / `db:seed` / `db:studio` | Prisma, via the backend workspace |

The fastest correctness gate is `npm run typecheck` — it must stay green in every workspace.

---

## How the two services talk

- **Auth is cross-origin.** The frontend keeps `@clerk/nextjs` (middleware + RSC `getToken()`);
  it forwards the Clerk session token as `Authorization: Bearer …` plus an `x-workspace-id`
  header. The backend verifies it via `@clerk/express` and pins `authorizedParties` to the
  frontend origin. Clerk hosts sign-in/up — there are **no login endpoints on the backend**.
- **Data.** RSC pages read through a server-side tRPC client; client components use the typed
  tRPC React provider / bearer REST. The frontend imports the backend's `AppRouter` **type** only.
- **Realtime.** socket.io with `user:{id}` / `workspace:{id}` rooms. `publishEvent` /
  `publishWorkspaceEvent` emit into those rooms; the client `useRealtime()` hook calls
  `router.refresh()` on any event.
- **OAuth.** Connect routes return `{ url }`; the browser is redirected there. Provider callbacks
  are hosted on the **backend** origin and redirect back to the frontend on success.

---

## API surface

The backend exposes two transports, fully documented (grouped by tag) at `/docs`:

- **REST** (`/api/*`, `/healthz`) — chat, task mutations, onboarding, integration OAuth, webhooks.
- **tRPC** (`/trpc/<procedure>`) — workspaces, members, tasks, workflow statuses, integrations,
  conversations, calendar. Queries are `GET` with a superjson `input` query param; mutations are
  `POST` with a superjson body. Workspace-scoped procedures require the `x-workspace-id` header.

Webhooks authenticate by signature (GitHub HMAC / Clerk Svix / Google channel); Inngest by its
signing key; the socket.io gateway by the Clerk handshake token.

---

## Environment variables

Two `.env.example` files document the full set. In short:

- **`khove_backend/.env.local`** — every secret: `DATABASE_URL` / `DIRECT_URL`, Upstash Redis,
  `ENCRYPTION_KEY` (AES-256-GCM for OAuth tokens), `ANTHROPIC_API_KEY`,
  `GOOGLE_GENERATIVE_AI_API_KEY`, all `GITHUB_*` (incl. `GITHUB_APP_WEBHOOK_SECRET`), Google OAuth,
  Clerk secret + `CLERK_WEBHOOK_SECRET`, `RESEND_API_KEY`, Inngest keys, plus `PORT`,
  `BACKEND_URL`, `FRONTEND_ORIGIN`.
- **`khove_frontend/.env.local`** — only public config + the Clerk publishable/secret keys and
  routing vars: `NEXT_PUBLIC_CLERK_*`, `CLERK_SECRET_KEY` (for RSC `getToken`),
  `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_WS_URL`.

`.env.local` files are gitignored and must never be committed.

---

## Deployment shape

- **Frontend →** Vercel.
- **Backend →** a persistent container (Railway / Render / Fly), running `prisma generate` at
  build, exposing `/trpc`, `/api/*`, `/healthz`, and the socket.io gateway. Point Inngest at
  `${BACKEND_URL}/api/inngest`. The pilot runs **single-instance** (in-memory socket rooms); scaling
  out later needs sticky sessions + a socket.io Redis adapter over a TCP Redis.

---

## Contributing

Read **[`CLAUDE.md`](CLAUDE.md)** first — it is the authoritative, load-bearing working guide
(scoping model, AI routing, architecture rules, known rough edges). Branching policy:
`development` (default) → `staging` → `production`, promoted one-way by fast-forward. All
day-to-day pushes go to `development`.
