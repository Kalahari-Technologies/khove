# Khove — Claude Code Working Guide

AI-native task and workflow intelligence for individuals and dev teams. Connects GitHub,
Google Calendar, and (planned) Jira behind a single conversational AI interface.

> This file is the authoritative checkpoint and lives **inside the repo**. `DOCUMENTATION.md`
> is the long-form developer manual; this file is the short, load-bearing context Claude needs.
> Verified against the code on 2026-07-21.

---

## Repo Layout Gotcha

The git repository root is **`khove/`**, nested inside the `Khove/` product folder:

```
Khove/                      ← product folder (NOT a git repo) — docs/, logos/
└── khove/                  ← git repo root — github.com/Kalahari-Technologies/khove
```

Always run `git`, `npm`, and `prisma` from `khove/`.

Branches: `development` (default, active), `staging`, `production`.

---

## Commands

```bash
npm run dev          # Next.js on :3000
npm run inngest      # Inngest dev server on :8288 (auto-discovers /api/inngest)
npm run build        # prisma generate && next build
npx tsc --noEmit     # typecheck — the fastest correctness gate, use it
npm run db:push      # push schema to Supabase
npm run db:studio    # Prisma Studio
```

For local dev, comment out `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` in `.env.local`.

---

## Stack

Next.js 14.2 (App Router) · React 18 · TypeScript · Tailwind 3 · Prisma 6 + Supabase Postgres ·
Clerk auth · Upstash Redis · tRPC 11 · Vercel AI SDK 6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) ·
Inngest 4 · Resend · Octokit · googleapis · motion 12.

---

## The Scoping Model — Read This First

**Everything is workspace-scoped.** This is the single most important architectural fact, and
it changed during the build — older notes claiming otherwise are wrong.

- `Integration.workspaceId` is **non-nullable**, with `@@unique([provider, workspaceId])`.
  Each workspace connects its own Google Calendar / GitHub independently.
  `userId` on the row records *who* connected it (needed for token refresh); `workspaceId` is
  the primary lookup key.
- Every integration helper takes `workspaceId` as its **first parameter** —
  `getCalendarClient(workspaceId)`, `getGitHubClient(workspaceId)`, `getCalendarTools(workspaceId)`,
  `getGitHubTools(workspaceId)`.
- Synced `Task` and `CalendarEntry` rows are workspace-scoped; their `userId` is *derived* from
  the workspace's integration row.
- The Planner (`app/[workspace]/planner/`) is **workspace-scoped** — it gates on membership and
  filters every query by `workspaceId: workspace.id`.

The only place `workspaceId: null` legitimately appears is `WorkflowStatus` rows, where null
means "global system default status".

URL shape: `/:workspace-slug/{chat,tasks,planner,github,settings}`. The personal workspace is
auto-created on signup with `slug = username`, `name = "My Space"`, and a random gradient.

---

## AI System

### Routing — `lib/ai/router.ts`

`scoreComplexity(message)` returns 0–10 from: multi-step connectors (capped +3), integration
keywords (+1 each), length (+1 over 100 chars, +2 over 200), analysis intent (+2).

`routeToModel(score, planTier)`:

| Condition | Model |
|---|---|
| `planTier === "FREE"` | Flash (unconditional) |
| score ≤ 2 | Flash |
| score 3–6 | Haiku |
| score ≥ 7 **and** tier is SMB/ENTERPRISE | Sonnet |
| score ≥ 7 on PRO/TEAM | Haiku (deliberate cost control) |

Model IDs live **only** in `lib/ai/providers/` — never hardcode them elsewhere:
- `google.ts` → `gemini-2.5-flash-lite`
- `anthropic.ts` → `claude-haiku-4-5-20251001`, `claude-sonnet-4-6`

### Orchestrator — `lib/ai/index.ts`

`runAIConversation({ userId, conversationId?, newMessage, planTier, workspaceId, userName })`
→ `{ blocked, response?, conversationId?, model?, error? }`

- Agentic loop caps at **5 steps** (`stopWhen: stepCountIs(5)`).
- History pruned to the last **40** non-system messages (`lib/ai/context.ts`).
- Memory summarised every 10 messages over the last 20, stored at Redis `memory:user:${userId}`,
  2000-char cap, 90-day TTL.
- Metering is two-track: pre-flight `checkAndIncrementUsage()` against Redis, plus a post-hoc
  `AiUsageLog` row (which stores the *tier* string, not the model ID, and no token counts).

### Tools — 13 total, all workspace-scoped

| File | Tools |
|---|---|
| `task-tools.ts` | createTask, listTasks, updateTask, deleteTask (soft — sets CANCELLED) |
| `calendar-tools.ts` | listUpcomingEvents, createCalendarEvent, checkAvailability |
| `github-tools.ts` | listRepositories, listPullRequests, getPullRequest, listIssues, createGitHubIssue, getRepoActivity |

`getToolsForContext()` loads tools by **connection status, not tier** — all integrations are free
on all tiers. Task tools always load. Jira tools do not exist yet (call site commented out).

---

## Billing — V3, action-based

Monetisation is via AI **actions**, not integration access.

| | Free | Pro $9 | Team $18/u | SMB $35/u | Enterprise |
|---|---|---|---|---|---|
| AI actions/mo | 20 | ∞ | 500 | 2000 | ∞ |
| Max workspaces | 2 | 5 | ∞ | ∞ | ∞ |
| Members/workspace | 4 | 4 | 20 | 50 | ∞ |
| Memory retention | 7d | full | full | full | full |
| Standup / custom AI instructions | ✗ | ✓ | ✓ | ✓ | ✓ |
| Team workspace + memory | ✗ | ✗ | ✓ | ✓ | ✓ |
| Sprint intelligence + admin | ✗ | ✗ | ✗ | ✓ | ✓ |
| Trial days | 0 | 14 | 14 | 21 | 0 |

`-1` means unlimited in `PLANS`. Redis usage keys: `usage:ws:${workspaceId}:YYYY-MM`
(workspace-scoped, since `runAIConversation` always passes a workspaceId), 35-day TTL.

---

## Background Jobs — 11 Inngest functions

Registered in `app/api/inngest/route.ts`:

**Calendar** (`lib/inngest/functions/calendar-sync.ts`): `google-calendar-initial-sync`,
`google-calendar-webhook`, `google-calendar-refresh-tokens`, `google-calendar-renew-webhooks`,
`google-calendar-disconnect-cleanup`

**GitHub** (`github-sync.ts`): `github-initial-sync`, `github-webhook-handler`

**Email** (`email.ts`, via Resend): `send-welcome-signup-email`, `send-welcome-back-email`,
`send-otp-email`, `send-new-device-email` — all triggered from the Clerk webhook.
Templates are raw HTML in `mail_templates/`, read from disk with `{{key}}` substitution.
Sender is `noreply@kalaharitech.xyz` (the verified domain), reply-to a Gmail address.
Welcome-back is rate-limited by a 24h Redis key; new-device fires on unseen `clientId`
(90-day Redis set).

---

## Real-Time

SSE endpoint `app/api/events/stream/` polls Redis every 3s. `publishEvent()` is user-scoped;
`publishWorkspaceEvent()` fans out to every member's queue. The `useRealtime()` hook calls
`router.refresh()` on any event.

---

## Architecture Rules — Non-Negotiable

- NEVER store OAuth tokens in plaintext — use `lib/encryption.ts` (AES-256-GCM).
- NEVER hardcode model names outside `lib/ai/providers/`.
- NEVER let a tool failure crash a conversation — try/catch every `tool.execute()`.
- NEVER process GitHub or Google Calendar webhooks synchronously — return 200, dispatch to Inngest.
- NEVER trust a checkout success redirect — wait for the webhook to activate a subscription.
- NEVER expose `billingProvider` to the client — the frontend sees `tier` and `status` only.
- NEVER set Jira status directly — use the transitions API. Jira description/comment fields must
  be ADF, never plain text or markdown.
- ALWAYS use the `PLANS` constant in `lib/billing/plans.ts` for any plan/tier logic.
- ALWAYS use `StatusCategory` for AI status operations — never raw status-name strings.
- ALWAYS treat `Task.source` as an **array** (`TaskSource[]`), never a single string.
- ALWAYS namespace per-platform data under `Task.metadata` keys (`googleCalendar`, `github`, `jira`).
- ALWAYS call `publishEvent()` / `publishWorkspaceEvent()` after a user-visible mutation.
- ALWAYS pass `workspaceId` first to integration helpers.

**Read-only file:** `lib/ai/router.ts` — complexity scoring and model selection. Do not change.

---

## UI Conventions

- Base palette is **B&W** — white-on-black opacity tokens (`bg-white/[0.04]`, `text-white/60`,
  `border-white/[0.08]`), codified in `lib/design-system/tokens.ts`.
- Colour exceptions, all deliberate: red for danger, blue for hashtags, DB-driven task status
  dots, 16 workspace gradient avatars, and **per-nav accent glows** in the sidebar
  (chat violet, tasks blue, planner rose, GitHub emerald, Jira indigo, settings amber).
- Animations via `motion/react` — spring transitions, staggered fade-ins.
- Nav icons are custom SVGs in `public/assets/` with filled/outlined active states.

---

## Current Status

| Area | State |
|---|---|
| Auth (Clerk, custom `/login` `/join` `/onboarding`) | ✅ |
| Workspaces (CRUD, roles, switcher, authorization) | ✅ |
| Prisma + Supabase, Redis, SSE, Inngest | ✅ |
| AI core (routing, tools, memory, metering) | ✅ |
| Google Calendar | ✅ workspace-scoped |
| GitHub | ✅ code complete — needs `GITHUB_*` env vars |
| Transactional email (Resend) | ✅ 4 templates |
| Planner month / week / day views | ✅ |
| Jira (Phase 5) | ❌ not started |
| Billing (Phase 6) | ❌ not started |

### Env vars actually read by code

`ANTHROPIC_API_KEY`, `CLERK_WEBHOOK_SECRET`, `ENCRYPTION_KEY`, `GITHUB_APP_ID`,
`GITHUB_APP_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GOOGLE_REDIRECT_URI`,
`NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`,
plus `DATABASE_URL` / `DIRECT_URL` (Prisma) and the `NEXT_PUBLIC_CLERK_*` routing vars.

Still unset: `ANTHROPIC_API_KEY` (blocks Haiku/Sonnet — everything falls back to Flash),
all `GITHUB_*`, all `ATLASSIAN_*`, all billing keys.

---

## Known Rough Edges

Observed while auditing; none are blocking, none have been "fixed" silently.

- `lib/ai/router.ts` scores `"pr"` with a bare `includes()`, so it matches inside words like
  "approve" and "pretty" — inflates complexity on innocuous messages.
- `redis.ts` has a no-op ternary: `workspaceId ? PLAN_LIMITS[tier] : PLAN_LIMITS[tier]`.
- `PLAN_LIMITS` in `redis.ts` duplicates the action limits in `plans.ts` — two sources of truth.
- A failed AI call still burns quota; usage is incremented before generation.
- `memoryRetentionDays: 7` on FREE is never applied to the 90-day Redis TTL.
- `customAiInstructions: false` on FREE is never enforced in `lib/ai/context.ts`.
- `workspace.delete` uses `workspaceProcedure` (member-level) while other destructive ops use
  `workspaceAdminProcedure` — verify the in-handler ownership check.
- Email template values are interpolated without HTML escaping.
- `calendar-client.tsx`'s `GithubIcon` has `alt="Jira"` (copy-paste).
