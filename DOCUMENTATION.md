# Khove — Developer Documentation

> AI-native **orchestration** for Product & Dev teams.
> Connects GitHub, Jira/Atlassian, and Google Calendar into a single connectivity thread,
> with a conversational AI layer today and agents on the roadmap.

---

## 0. Product Direction — V4 Pivot (roadmap, not yet built)

Khove is pivoting from *conversational AI over your tools* to an **AI-native orchestration
platform**. The rest of this manual documents the **shipped** system (conversational layer);
this section is the forward roadmap. See `product_docs/Technical PRD.md` §11–14 and Concept
Note V4 for detail.

- **Orchestrator, not code-writer.** Khove sits above the repo and dispatches to Cursor /
  Claude Code / Codex — it never competes with them. The moat is cross-context memory, not code.
- **Connectivity Thread** — the target core primitive: one work item spanning GitHub / Jira /
  Calendar / people. Evolves from today's `Task.source[]` + namespaced `metadata`.
- **Agents** run on the existing Inngest substrate (durable steps, cron, concurrency) as
  event-driven workers. First: **GitHub PR Shepherd** (webhook-triggered; propose→approve
  gated; audited via `AiUsageLog` + SSE events).
- **MCP server (Khove-as-provider)** — exposes Threads + actions so Khove context is usable
  inside external coding agents. First "outside Khove" surface; plugins/marketplace + CLI = Act 2.
- **Metering** evolves from AI actions → agent-runs + platform entitlements, always plan-gated.
- **Pilot:** Thread + PR Shepherd + minimal MCP. Prerequisite: fix the GitHub webhook secret
  env-name mismatch (`GITHUB_WEBHOOK_SECRET` vs `GITHUB_APP_WEBHOOK_SECRET`) so webhooks work.

---

## 1. Quick Start

### Prerequisites

- **Node.js 20+** and **npm**
- **Supabase** account (PostgreSQL database)
- **Clerk** account (authentication)
- **Upstash** account (Redis for caching + real-time)
- **Google Cloud** project (Calendar OAuth)
- **Inngest** account (background jobs — optional for local dev)

### Setup

```bash
# Clone
git clone https://github.com/Kalahari-Technologies/khove.git
cd khove

# Install
npm install

# Environment
cp .env.example .env.local
# Fill in all values (see Section 4 for details)

# Database
npx prisma db push

# Run (two terminals)
npm run dev          # Next.js on port 3000
npx inngest-cli dev  # Inngest dev server on port 8288
```

### First Login

1. Navigate to `http://localhost:3000`
2. Sign up via Google, GitHub, or email
3. Complete onboarding: pick a username (becomes your workspace slug)
4. Personal workspace auto-created → redirected to `/:username/chat`

---

## 2. Project Structure

```
khove/
├── app/
│   ├── [workspace]/            # Workspace-scoped pages (dynamic slug)
│   │   ├── chat/               # AI chat interface
│   │   ├── tasks/              # Task list, detail, create form
│   │   ├── planner/            # Calendar month grid
│   │   ├── github/             # GitHub dashboard
│   │   ├── settings/           # Workspace settings + members
│   │   └── layout.tsx          # Workspace layout (sidebar, realtime provider)
│   ├── api/
│   │   ├── chat/               # AI conversation endpoint
│   │   ├── tasks/              # Task CRUD (POST, PATCH status/priority/due-date)
│   │   ├── events/stream/      # SSE real-time endpoint
│   │   ├── inngest/            # Inngest serve route (7 functions)
│   │   ├── integrations/       # OAuth connect/callback/disconnect (Google, GitHub)
│   │   ├── webhooks/           # Google Calendar + GitHub + Clerk webhooks
│   │   ├── onboarding/         # Username setup
│   │   └── trpc/               # tRPC handler
│   ├── login/                  # Custom Clerk sign-in
│   ├── join/                   # Custom Clerk sign-up
│   ├── onboarding/             # Post-signup username picker
│   └── sso-callback/           # OAuth redirect handler
├── components/
│   ├── app-sidebar.tsx         # Icon rail + detail panel + workspace switcher
│   ├── upgrade-dialog.tsx      # V3 pricing cards (Free/Pro/Team)
│   ├── confirm-dialog.tsx      # Reusable 2/3-button confirmation
│   ├── realtime-provider.tsx   # SSE connection (in layout)
│   ├── workspace-switcher.tsx  # Gradient avatar dropdown
│   ├── create-workspace-dialog.tsx
│   ├── members-manager.tsx
│   └── auth/                   # Login/join UI (orbit display, auth input)
├── lib/
│   ├── ai/
│   │   ├── index.ts            # runAIConversation() — main orchestrator
│   │   ├── router.ts           # Complexity scoring + model selection (READ-ONLY)
│   │   ├── context.ts          # System prompt assembly
│   │   ├── memory.ts           # Persistent AI memory (Redis)
│   │   ├── tools/              # AI tool definitions
│   │   │   ├── index.ts        # getToolsForContext() — tier-based loading
│   │   │   ├── task-tools.ts   # create, list, update, delete tasks
│   │   │   ├── calendar-tools.ts # list events, create event, check availability
│   │   │   └── github-tools.ts # repos, PRs, issues, activity
│   │   └── providers/
│   │       ├── google.ts       # Gemini Flash
│   │       └── anthropic.ts    # Haiku + Sonnet
│   ├── integrations/
│   │   ├── google-calendar.ts  # OAuth, sync, push, Meet links, webhooks
│   │   └── github.ts           # OAuth, Octokit, PRs, issues, activity
│   ├── inngest/
│   │   └── functions/
│   │       ├── calendar-sync.ts # 5 functions (sync, webhook, refresh, renew, cleanup)
│   │       └── github-sync.ts   # 2 functions (initial sync, webhook handler)
│   ├── workspace/              # Workspace utilities
│   │   ├── authorization.ts    # canAdmin, canWrite, canRead permission helpers
│   │   ├── create-personal.ts  # ensurePersonalWorkspace()
│   │   ├── get-workspace.ts    # React cache() queries
│   │   ├── resolve.ts          # resolveWorkspaceBySlug()
│   │   ├── slug.ts             # sanitizeSlug(), RESERVED_SLUGS
│   │   ├── gradients.ts        # 16 gradient presets
│   │   └── workspace-context.tsx # WorkspaceProvider + useWorkspace()
│   ├── billing/
│   │   ├── plans.ts            # PLANS constant — single source of truth
│   │   └── enforcement.ts      # Usage checking, feature gating
│   ├── auth.ts                 # getCurrentUser() — auto-upserts from Clerk
│   ├── db.ts                   # Prisma client singleton
│   ├── redis.ts                # Upstash Redis singleton
│   ├── realtime.ts             # publishEvent() + publishWorkspaceEvent()
│   ├── encryption.ts           # AES-256-GCM encrypt/decrypt
│   ├── inngest.ts              # Inngest client instance
│   └── hooks/
│       └── use-realtime.ts     # SSE client hook
├── server/
│   ├── trpc.ts                 # tRPC setup + workspace middleware
│   └── routers/
│       ├── _app.ts             # Root router
│       ├── workspace.ts        # Workspace CRUD + members
│       └── task.ts             # Task operations
├── prisma/
│   └── schema.prisma           # Full database schema
└── public/assets/              # SVG icons (nav, platforms)
```

---

## 3. Architecture

### Seven-Layer Stack

| Layer | Technology | Responsibility |
|-------|-----------|----------------|
| Frontend | Next.js 14 (App Router) | Server components, streaming, routing |
| Auth | Clerk | OAuth (Google, GitHub, Atlassian), webhooks |
| API | tRPC + REST | tRPC for internal, REST for integrations |
| AI | Vercel AI SDK | Model routing, tool-calling, agentic loop |
| Database | PostgreSQL (Supabase) | All persistent data |
| Cache | Redis (Upstash) | Usage metering, real-time events, sync tokens |
| Background Jobs | Inngest | Webhook processing, sync, cron jobs |

### Workspace Scoping Model

**All data is workspace-scoped.** Every query includes `workspaceId`:

```
URL: /:workspace-slug/tasks
      ↓
resolveWorkspaceBySlug(slug) → workspace.id
      ↓
db.task.findMany({ where: { workspaceId: workspace.id } })
```

- **Personal workspace**: auto-created on signup, `isPersonal: true`, slug = username
- **Team workspaces**: created manually, role-based access (OWNER/ADMIN/MEMBER/VIEWER)
- **Integrations are workspace-owned**: connecting Google Calendar in workspace A doesn't affect workspace B

### Integration Scoping

```
Integration record:
  provider: "GOOGLE_CALENDAR"
  workspaceId: "ws_abc123"     ← which workspace owns this connection
  userId: "user_xyz"           ← who connected it (for token refresh)
  accessTokenEnc: "..."        ← AES-256-GCM encrypted
```

- One integration per provider per workspace (`@@unique([provider, workspaceId])`)
- Only OWNER/ADMIN can connect/disconnect
- Synced tasks land in the owning workspace
- AI tools only see integrations for the active workspace

### AI Request Flow

```
User message
  → Redis usage check (plan limits)
  → Context assembly (history + memory + workspace settings)
  → Complexity scoring → model selection (Flash / Haiku / Sonnet)
  → Tool loading (workspace-scoped integrations)
  → AI provider call
  → Tool execution loop (max 5 iterations)
  → Response returned
  → Post-processing (usage log, memory update, conversation save)
```

---

## 4. Environment Variables

### File Hierarchy (Next.js loads in this order, highest priority first)

| File | Purpose | Committed to Git? |
|------|---------|-------------------|
| `.env.development.local` | Local dev overrides (empty Inngest keys) | No (gitignored) |
| `.env.local` | All real credentials | No (gitignored) |
| `.env.example` | Template with empty values | Yes |

### Why `.env.development.local` exists

Inngest cloud keys conflict with the local Inngest dev server. `.env.development.local` overrides them to empty during `npm run dev`, so the local dev server works. In production (Vercel), the real keys from the Vercel dashboard are used. No manual commenting needed.

### Variable Reference

| Variable | Required | Source | Notes |
|----------|----------|--------|-------|
| `DATABASE_URL` | Yes | Supabase | Connection pooler (:6543) |
| `DIRECT_URL` | Yes | Supabase | Direct connection (:5432) for migrations |
| `CLERK_SECRET_KEY` | Yes | Clerk Dashboard | |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes | Clerk Dashboard | |
| `CLERK_WEBHOOK_SECRET` | Yes | Clerk Dashboard → Webhooks | |
| `UPSTASH_REDIS_REST_URL` | Yes | Upstash Console | |
| `UPSTASH_REDIS_REST_TOKEN` | Yes | Upstash Console | |
| `ENCRYPTION_KEY` | Yes | Generate: `openssl rand -hex 32` | 64-char hex (32 bytes) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Yes | Google AI Studio | For Gemini Flash |
| `GOOGLE_CLIENT_ID` | Yes | Google Cloud Console | Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes | Google Cloud Console | |
| `GOOGLE_REDIRECT_URI` | Yes | — | `http://localhost:3000/api/integrations/google/callback` locally |
| `ANTHROPIC_API_KEY` | For paid tiers | console.anthropic.com | Haiku + Sonnet models |
| `INNGEST_SIGNING_KEY` | Production only | Inngest Dashboard | Empty in `.env.development.local` |
| `INNGEST_EVENT_KEY` | Production only | Inngest Dashboard | Empty in `.env.development.local` |
| `NEXT_PUBLIC_APP_URL` | Yes | — | `http://localhost:3000` locally, `https://khove.io` in prod |
| `GITHUB_APP_ID` | Phase 4 | GitHub Developer Settings | |
| `GITHUB_APP_PRIVATE_KEY` | Phase 4 | GitHub Developer Settings | PEM key |
| `GITHUB_WEBHOOK_SECRET` | Phase 4 | GitHub Developer Settings | |
| `GITHUB_CLIENT_ID` | Phase 4 | GitHub Developer Settings | |
| `GITHUB_CLIENT_SECRET` | Phase 4 | GitHub Developer Settings | |
| `ATLASSIAN_CLIENT_ID` | Phase 5 | Atlassian Developer Console | |
| `ATLASSIAN_CLIENT_SECRET` | Phase 5 | Atlassian Developer Console | |
| `CLERK_TELEMETRY_DISABLED` | Optional | — | Set to `1` to suppress Clerk `fs` warning |

---

## 5. Database

### Core Models

| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | All user accounts | clerkId, email, planTier |
| `Workspace` | Team/personal containers | slug, isPersonal, gradient, ownerId |
| `WorkspaceMember` | Membership + roles | workspaceId, userId, role |
| `Task` | All tasks across sources | title, source[], statusId, workspaceId, metadata |
| `WorkflowStatus` | Flexible status system | name, color, category (StatusCategory enum) |
| `CalendarEntry` | Display-only events (holidays) | workspaceId, title, startDate, source |
| `Integration` | OAuth connections | provider, workspaceId, accessTokenEnc |
| `Conversation` | AI chat history | messages (JSON), workspaceId |
| `AiUsageLog` | Per-call metering | model, tokensIn/Out, costUsd |
| `Subscription` | Billing state | tier, status, billingProvider |

### Key Design Decisions

- **Task.source is an array** (`TaskSource[]`): a task synced to GitHub AND Google Calendar has `source: ["KHOVE", "GITHUB", "GOOGLE_CALENDAR"]`
- **Task.metadata is JSON**: stores per-platform data under namespaced keys (`metadata.googleCalendar.meetLink`, `metadata.github.repo`)
- **StatusCategory enum**: AI always works with categories (NOT_STARTED, IN_PROGRESS, IN_REVIEW, BLOCKED, DONE, CANCELLED) — never raw status names
- **Integration.workspaceId is required**: each workspace independently manages its own connections
- **OAuth tokens always encrypted**: `lib/encryption.ts` AES-256-GCM before storage

### Commands

```bash
npx prisma db push      # Sync schema to DB (dev — no migration files)
npx prisma generate     # Regenerate Prisma client
npx prisma studio       # Visual DB browser at localhost:5555
npx prisma migrate dev  # Create migration files (for production)
```

---

## 6. AI System

### Model Routing

| Complexity | Model | When |
|------------|-------|------|
| 0–2 (Simple) | Gemini 2.5 Flash | Single tool, clear intent, short message |
| 3–6 (Medium) | Claude Haiku | 1–2 tools, moderate reasoning |
| 7+ (Complex) | Claude Sonnet | Multi-tool, sprint analysis, retros |
| Free tier (always) | Gemini Flash | Regardless of complexity |

**Read-only file:** `lib/ai/router.ts` — do not modify unless changing pricing.

### Tool Registry

Tools are loaded per workspace based on connected integrations:

```ts
// lib/ai/tools/index.ts
getToolsForContext(userId, workspaceId, planTier, connectedIntegrations)
```

- `tasks` category: always loaded
- `calendar` category: loaded if GOOGLE_CALENDAR integration exists in workspace
- `github` category: loaded if GITHUB integration exists in workspace
- `jira` category: loaded if JIRA integration exists in workspace (Phase 5)

### Adding a New AI Tool

1. Create `lib/ai/tools/my-tools.ts`:
```ts
import { tool, zodSchema } from "ai";
import { z } from "zod";

export function getMyTools(workspaceId: string) {
  return {
    myTool: tool({
      description: "What this tool does",
      inputSchema: zodSchema(z.object({ /* params */ })),
      execute: async (params) => {
        try {
          // ... implementation
          return { success: true, data: ... };
        } catch (error) {
          return { success: false, error: String(error) };
        }
      },
    }),
  };
}
```

2. Register in `lib/ai/tools/index.ts`:
```ts
if (categories.includes("myCategory")) {
  Object.assign(tools, getMyTools(workspaceId));
}
```

3. Add category gate in `lib/billing/enforcement.ts`

**Rules:**
- Every `execute()` must be wrapped in try/catch — tool failures never crash conversations
- Return `{ success: true, ... }` or `{ success: false, error }` — never throw

---

## 7. Integrations

### Google Calendar

**OAuth flow:**
```
GET /api/integrations/google/connect?workspaceId=xxx
  → Google consent screen
  → GET /api/integrations/google/callback (state = userId:workspaceId)
  → Upsert Integration record (encrypted tokens)
  → Inngest: initialCalendarSync (background)
  → SSE: router.refresh() when done
```

**Three-category sync:**
- **Actionable events** (from primary/writable calendars, `eventType === "default"`) → become `Task` records
- **External events** (holidays, birthdays, subscribed calendars) → become `CalendarEntry` records (display only)
- **Khove → GCal push**: creating a task with GCal sync enabled creates a Google Calendar event (with optional Meet link)

**Webhook lifecycle:**
1. After initial sync → `registerWebhook()` (production only — needs HTTPS)
2. Google sends POST to `/api/webhooks/google-calendar` on event changes
3. Webhook returns 200 immediately → dispatches to Inngest
4. Inngest fetches incremental changes via sync token → upserts tasks/entries
5. Daily cron at 9am renews channels expiring within 24 hours
6. On disconnect → stop webhook channel → delete synced data

### GitHub

**OAuth flow:**
```
GET /api/integrations/github/connect?workspaceId=xxx
  → GitHub consent screen
  → GET /api/integrations/github/callback (state = userId:workspaceId)
  → Upsert Integration record
  → Inngest: initialGitHubSync (top 5 repos → PRs + issues → tasks)
```

**Webhook processing:**
- Signature verification: `x-hub-signature-256` with constant-time comparison
- Returns 200 immediately → dispatches to Inngest
- Handles: `pull_request` (opened/closed/merged), `issues` (opened/closed)
- Multi-workspace fan-out: same GitHub user in multiple workspaces → tasks created in each

### Adding a New Integration

Pattern:
1. `lib/integrations/my-platform.ts` — OAuth client, API wrapper functions (`(workspaceId, ...)` signatures)
2. `app/api/integrations/my-platform/connect/route.ts` — accept `?workspaceId`, encode in OAuth state
3. `app/api/integrations/my-platform/callback/route.ts` — parse state, upsert by `provider_workspaceId`
4. `app/api/integrations/my-platform/disconnect/route.ts` — accept `workspaceId` in body, admin check
5. `lib/inngest/functions/my-platform-sync.ts` — initial sync + webhook handler
6. `lib/ai/tools/my-platform-tools.ts` — AI tool definitions
7. Register functions in `app/api/inngest/route.ts`
8. Register tools in `lib/ai/tools/index.ts`

---

## 8. Real-Time (SSE)

### Architecture

```
Mutation (API route or Inngest function)
  → publishEvent(userId, { type: "task.updated", taskId })
    or publishWorkspaceEvent(workspaceId, { type: "calendar.synced", ... })
  → Redis LPUSH to events:{userId} (2 commands: LPUSH + EXPIRE)

SSE endpoint (GET /api/events/stream)
  → Polls Redis every 3 seconds
  → Drains events: LRANGE + DEL
  → Streams to client as EventSource messages
  → Auto-closes at 55s (Vercel function limit)

Client (useRealtime hook in layout)
  → EventSource auto-reconnects
  → On any event → router.refresh() (re-fetches server components)
```

### When to Publish Events

| Function | Event | Use |
|----------|-------|-----|
| `publishEvent(userId, event)` | User-scoped | Task mutations, calendar disconnect, generic refresh |
| `publishWorkspaceEvent(workspaceId, event)` | Workspace-scoped | Calendar sync, GitHub sync (notifies all members) |

### Cost

- **Publish:** 2 Redis commands per event (LPUSH + EXPIRE)
- **Poll:** 1–2 Redis commands per 3s per active tab (LRANGE + conditional DEL)
- **~40 commands/min per active tab** — well within Upstash free tier (10k/day)

---

## 9. Background Jobs (Inngest)

### Registered Functions

| Function | Trigger | What it Does |
|----------|---------|--------------|
| `initialCalendarSync` | `google-calendar/initial-sync` | Full sync: fetch all calendars → classify → create tasks + entries |
| `handleCalendarWebhook` | `google-calendar/webhook.received` | Incremental sync via sync token |
| `refreshExpiringTokens` | Cron: `*/30 * * * *` | Refresh OAuth tokens expiring within 10 min |
| `renewCalendarWebhooks` | Cron: `0 9 * * *` | Renew webhook channels expiring within 24h |
| `disconnectCalendarCleanup` | `google-calendar/disconnected` | Stop webhook + delete synced tasks/entries |
| `initialGitHubSync` | `github/initial-sync` | Sync top 5 repos → open PRs + issues → tasks |
| `handleGitHubWebhook` | `github/webhook.received` | Process PR/issue events → create/update tasks |

### Local Development

```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: Inngest dev server
npx inngest-cli dev
# Dashboard: http://localhost:8288
# Auto-discovers serve route at /api/inngest
```

**Important:** `.env.development.local` sets Inngest keys to empty — this tells the SDK to use the local dev server instead of Inngest cloud.

### Adding a New Function

1. Create in `lib/inngest/functions/my-function.ts`:
```ts
import { inngest } from "@/lib/inngest";

export const myFunction = inngest.createFunction(
  {
    id: "my-function-id",
    triggers: [{ event: "my-app/my-event" }],
    // or: triggers: [{ cron: "0 9 * * *" }],
  },
  async ({ event, step }) => {
    const result = await step.run("step-name", async () => {
      // ... work
    });
    return result;
  },
);
```

2. Register in `app/api/inngest/route.ts`:
```ts
import { myFunction } from "@/lib/inngest/functions/my-function";
// Add to functions array in serve()
```

---

## 10. Deployment

### Vercel

The app deploys automatically on push to the `development` branch.

**Build command** (in `package.json`):
```
prisma generate && next build
```

`prisma generate` runs before every build to ensure the Prisma client matches the latest schema.

**Required Vercel environment variables:**
- All variables from Section 4 marked "Yes" or "Production only"
- `NEXT_PUBLIC_APP_URL=https://khove.io` (enables webhook registration)
- `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY` (from Inngest dashboard)

**Inngest cloud:**
1. Create app at app.inngest.com
2. Copy Signing Key + Event Key → Vercel env vars
3. Inngest auto-discovers the serve route at `https://khove.io/api/inngest`
4. Or manually sync: Inngest dashboard → Apps → Sync new app → paste URL

**Google Calendar webhooks:**
- Only work in production (require public HTTPS)
- Webhook registration happens automatically after OAuth connect when `NEXT_PUBLIC_APP_URL` is not localhost
- Channels expire after 7 days — daily cron renews them

### Branch Strategy

| Branch | Purpose | Auto-deploy |
|--------|---------|-------------|
| `development` | Active development | Yes (preview) |
| `staging` | Pre-production testing | Yes (staging) |
| `production` | Live | Yes (production) |

---

## 11. UI Conventions

### Design System

- **Pure B&W palette** — `white/opacity` tokens (`bg-white/[0.04]`, `text-white/50`, etc.)
- **No brand colors** — the PRD specified indigo-violet but the implementation uses monochrome
- **Color exceptions**: red for danger buttons, blue for #hashtag highlighting, status dot colors, workspace gradient avatars

### Animations

- **Library:** `motion/react` (Framer Motion v12)
- **Default easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — snappy ease-out
- **Dialogs:** `scale: 0.95 → 1` entrance with staggered `FADE_IN` content
- **Dropdowns:** `opacity + y + scale` with 100ms duration

### Nav Icons

Custom SVG assets at `/public/assets/`:
- Active state: `chat.svg`, `tasks.svg`, `planner.svg` (filled)
- Inactive state: `chat-outlined.svg`, `tasks-outlined.svg`, `planner-outlined.svg` (outlined)
- Platform icons: `google-calendar.svg`, `google-meet.svg`, `github.svg`, `jira.svg`, `khove-rounded.png`

### Dialog Patterns

Two reusable dialog components:
- **UpgradeDialog** (`components/upgrade-dialog.tsx`): 3-column pricing cards, BorderTrail effect, feature-aware context
- **ConfirmDialog** (`components/confirm-dialog.tsx`): 2 or 3 buttons, `variant: "danger"` for red confirm button

---

## 12. Scripts Reference

| Command | What it Does |
|---------|--------------|
| `npm run dev` | Start Next.js dev server (port 3000) |
| `npm run build` | `prisma generate && next build` |
| `npm run start` | Start production server |
| `npm run inngest` | Start Inngest local dev server (port 8288) |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Push schema to database (no migration files) |
| `npm run db:migrate` | Create migration files |
| `npm run db:seed` | Run database seed script |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## Architecture Rules (Non-Negotiable)

These rules are enforced across the entire codebase:

- **NEVER** store OAuth tokens in plaintext — use `lib/encryption.ts`
- **NEVER** hardcode model names outside `lib/ai/providers/`
- **NEVER** let tool failures crash a conversation — try/catch every `execute()`
- **NEVER** process webhooks synchronously — return 200, dispatch to Inngest
- **NEVER** expose `billingProvider` to the client — frontend sees `tier` and `status` only
- **ALWAYS** use `PLANS` constant in `lib/billing/plans.ts` for all plan logic
- **ALWAYS** use `StatusCategory` for AI task status operations — never raw status names
- **ALWAYS** use `Task.source` as an array (`TaskSource[]`) — never a single string
- **ALWAYS** store per-platform data in `Task.metadata` under namespaced keys
- **ALWAYS** scope queries to `workspaceId` — never fetch data across workspaces
