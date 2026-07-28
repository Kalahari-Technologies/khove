# Khove — Claude Code Working Guide

AI-native **orchestration** for Product & Dev teams. Connects GitHub, Google Calendar, and
(planned) Jira into a single connectivity thread, with a conversational AI layer today and
agents on the roadmap.

> This file is the authoritative checkpoint and lives **inside the repo**. `DOCUMENTATION.md`
> is the long-form developer manual; this file is the short, load-bearing context Claude needs.
> Verified against the code on 2026-07-21.

---

## Product Direction — V4 Pivot (read before proposing features)

Khove is pivoting from *conversational AI over your tools* to an **AI-native orchestration
platform**. The shipped code today is still the conversational layer; the pivot below is
**direction, not yet built** (see `product_docs/Technical PRD.md` §11–14, Concept Note V4).

- **Orchestrator, not code-writer.** Khove sits *above the repo*, turns product intent into
  dispatched dev work, and tracks it home. It does **not** compete with Cursor / Claude Code /
  Codex — it hands off to them. Never build repo-level code generation.
- **Connectivity Thread** is the target core primitive — one work item spanning GitHub / Jira /
  Calendar / people; the evolution of the existing `Task.source[]` + `metadata` model.
- **Agents across the thread.** First agent: **GitHub PR Shepherd** (webhook-triggered;
  Inngest is the runtime). Agent writes are **gated behind human approval by default**; every
  action is audited.
- **Khove-as-a-provider via MCP** — expose Threads + actions so Khove context is usable inside
  Cursor / Claude Code / Codex. First "outside Khove" surface; plugins/marketplace + CLI = Act 2.
- **Metering** evolves from AI actions → agent-runs + platform entitlements, always plan-gated.
- **Memory = mem0 (self-hosted).** Supersedes the Redis blob in `lib/ai/memory.ts`. Backed by
  `pgvector` on Supabase + Gemini embeddings (no new vendor; data stays in-house). Isolation
  boundary is **`workspaceId`** — never call mem0 raw; go through a `scopedMemory(workspaceId,
  userId)` wrapper. Two scopes: **workspace memory** (work content, never crosses a workspace) and
  **personal memory** (preferences only, content-free, travels across a user's own workspaces).
  Three tiers: conversation / Thread (`run_id=threadId`) / agent (`agent_id+workspaceId`).
- **Positioning:** *companies have a context problem, not a project-management problem.*
  **Proactive, not a chatbot.** Loop = **Observe → Understand → Predict → Recommend → Act**.
  All agent output is **evidence-backed** (signal + confidence + sources). Governance =
  **read auto / write approval / delete explicit**, always audited. *MCP is plumbing, not the moat.*
- **AI provider:** Anthropic + Google **direct** for the pilot (default no-training terms + DPA).
  **ZDR is not a pilot toggle** — request it when an enterprise deal needs it. Bedrock / Vertex are
  provider-swaps behind `lib/ai/providers/`, added when a customer requires in-cloud data residency
  — do **not** pre-build a multi-provider gateway.
- **Pilot:** Thread + PR Shepherd + minimal MCP server + mem0 memory (fixing the GitHub webhook bug
  below is a prerequisite — the sensor is currently deaf). See `product_docs/Technical PRD.md`
  §15–18 for scope and the explicit "not building yet" list.

---

## Repo Layout Gotcha

The git repository root is **`khove/`**, nested inside the `Khove/` product folder:

```
Khove/                      ← product folder (NOT a git repo) — docs/, logos/
└── khove/                  ← git repo root — github.com/Kalahari-Technologies/khove
```

Always run `git`, `npm`, and `prisma` from `khove/`.

### Branching & Release Policy

Long-lived remote branches (the environments): `development` (default, active) →
`staging` → `production`.

- **All pushes go to `development`.** It is the only branch you push day-to-day.
- **Promotion is one-way and in order:** `development` → `staging` → `production`.
  Promote by fast-forwarding each downstream branch to the upstream one (never push a
  feature straight to `staging`/`production`, and never promote backwards).
- **Workspace branches stay local — never push them.** Each Conductor workspace works on
  its own local branch (e.g. `project-context-overview`, `merge-env-fixes-across-branches`).
  Land the work by merging/pushing to `development`, then delete any workspace branch that
  was pushed to the remote. The remote should only ever hold `development`, `staging`,
  and `production`.

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
- **GitHub webhook is deaf (env-name mismatch).** `lib/integrations/github.ts` reads
  `process.env.GITHUB_WEBHOOK_SECRET`, but `.env.local` defines `GITHUB_APP_WEBHOOK_SECRET`, so
  the secret is `undefined` and `verifyWebhookSignature` rejects every webhook. No incremental
  GitHub sync. Blocks the PR Shepherd — fix before the pilot.
- **Sidebar `action: true` items are dead buttons.** In `components/app-sidebar.tsx`, items with
  `action: true` (`Connect GitHub`, `New conversation`, `New task`, `Filter`) render as a
  `<button>` with no `onClick`. Only `href` items work. The only working GitHub connect entry is
  the button on the `/github` page.
- The GitHub page is a one-time snapshot: initial sync only covers **owned** repos and **open**
  items (`type: "owner"`), has no refresh/re-sync, and never renders repo activity. "Code
  complete" ≠ usable — real PRs in org/collaborator repos never appear.
