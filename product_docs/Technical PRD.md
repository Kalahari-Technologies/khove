**TECHNICAL PRD -- V1.4**

**Khove.io**

*Implementation-accurate specification*

Kigali & Lagos  |  2025  |  Confidential

## **0. Document Purpose & Version History**

This is the authoritative technical specification for Khove. It reflects the actual codebase, not the original planned architecture. All prior PRD versions are superseded by this document.

**Reading rule for V1.3:** sections describing the shipped system remain implementation-accurate. New concepts introduced by the V4 pivot -- the Connectivity Thread, the agent runtime, the PR Shepherd, and the MCP server -- are explicitly tagged **[DIRECTION -- not yet built]**. Do not read a DIRECTION section as describing existing code.

| Version | Key changes |
| --- | --- |
| V1.0 (original) | LangChain + Pusher + Zustand + indigo-violet design + message-based metering |
| V1.1 | Action-based metering, workspace model, planTier removed from Workspace, Pro trial card required |
| V1.2 | Reflects actual implementation: Vercel AI SDK only, custom SSE realtime, B&W design, expanded task schema, 3-category calendar sync, Google Meet, deliberation items documented |
| V1.3 | **Orchestration pivot (aligns with Concept Note V4).** Adds positioning ("orchestrator, not code-writer"), and four DIRECTION sections: Connectivity Thread, Agent Runtime (GitHub PR Shepherd), MCP server (Khove-as-provider), and metering evolution to agent-runs. Records the GitHub webhook env-name bug. Shipped-system sections unchanged. |
| V1.4 (this) | **Pilot plan + memory architecture.** Adds the concrete V4 pilot (§15), the mem0-based memory layer with tenant-safe scoping (§16), the data-integrity posture for a B2B+B2C product (§17), and an explicit Pilot-vs-Vision boundary (§18). Enhances the PR Shepherd (§12) with evidence-backed output and read/write/delete governance. Adopts sharpened positioning language ("context problem, not a project-management problem"; Observe→Understand→Predict→Recommend→Act; proactive, not a chatbot). |

## **1. Architecture Deviations From Prior PRDs**

*All deviations below are intentional and permanent unless marked [DELIBERATION]. Do not revert them without explicit discussion.*

| Area | Prior PRD | What is built | Status |
| --- | --- | --- | --- |
| AI orchestration | LangChain.js + Vercel AI SDK | Vercel AI SDK only (ai package) | Permanent -- tool() + generateText() handles everything V1 needs |
| LangChain | -- | Not implemented | DELIBERATION -- revisit if tool count exceeds 15 or multi-agent patterns are needed |
| Realtime | Pusher / Supabase Realtime | Custom SSE via Redis LPUSH + 3s polling | Permanent -- zero deps, works on Vercel serverless, uses existing Upstash |
| Client state | Zustand / Jotai | None -- server components + router.refresh() | Permanent -- App Router eliminates need for client state on data |
| Design colors | Indigo-violet brand (#6366F1) | Pure B&W with white/opacity tokens | Permanent -- user decision, monochrome is the brand |
| Typography | Geist + Cal Sans | System defaults | DEFERRED -- load during full UI design phase, not removed |
| File storage | Cloudflare R2 | Not implemented | DEFERRED -- no file upload features in current scope |
| Gemini model | gemini-2.5-flash | gemini-2.5-flash-lite | Permanent -- confirmed working, better cost for free tier |
| Product positioning | "AI task manager" | **Orchestrator, not code-writer** -- sits above the repo, dispatches to Cursor/Claude Code/Codex, never competes with them | Permanent -- V4 product decision. Do not build repo-level code generation. |
| Primary primitive | Task | Task today; **Connectivity Thread** is the V4 target (see §11) | DIRECTION -- Thread not yet built; Task model is its seed |

## **2. Definitive Technology Stack**

| Layer | Technology | Status |
| --- | --- | --- |
| Framework | Next.js 14 App Router -- TypeScript throughout | Active |
| Auth | Clerk -- Google + GitHub OAuth, webhook user sync | Active |
| Database | PostgreSQL via Supabase. ORM: Prisma. | Active |
| Cache + Metering + Realtime | Redis via Upstash -- action counters, OAuth state, AI memory, SSE event queue | Active |
| AI Orchestration | Vercel AI SDK (ai package) -- tool(), generateText(), streamText() | Active |
| AI Models | gemini-2.5-flash-lite (free), claude-haiku-4-5-20251001 (paid/medium), claude-sonnet-4-6 (complex) | Active |
| Realtime | Custom SSE: publishEvent() writes LPUSH+EXPIRE to Redis. Client polls every 3s. | Active |
| Background Jobs | Inngest -- calendar sync, webhook processing, disconnect cleanup | Active |
| Google Calendar | googleapis package -- full bidirectional sync + Meet integration | Active |
| GitHub App | Not started | Phase 4 |
| Jira / Atlassian | Not started | Phase 5 |
| Billing | Stripe / Paystack / Flutterwave -- schema designed, not implemented | Phase 6 |
| File storage | Cloudflare R2 -- deferred | Deferred |
| Hosting | Vercel | Active |
| API | tRPC (internal) + REST (integration APIs) | Active |

## **3. Database Schema -- Current State**

### **3.1 Task Model -- Improvements Over PRD**

| Field | Original PRD spec | Actual | Why |
| --- | --- | --- | --- |
| source | Single enum: KHOVE, GITHUB, JIRA, AI | TaskSource[] array | A task can exist on multiple platforms simultaneously. Single enum breaks bidirectional sync. |
| GOOGLE_CALENDAR | Not in TaskSource | Added to TaskSource enum | Calendar events sync as real tasks. Must be distinguishable from other sources. |
| metadata | Not in PRD | Json? field | Stores per-platform data: Meet links, calendar event IDs, attendees, end times, agenda. Required for Calendar integration. |
| description | Not in Task model | String? added | Required for task detail page. Supports #hashtag and @mention blue highlighting. |

// Current TaskSource enum:

enum TaskSource { KHOVE  GITHUB  JIRA  AI  GOOGLE_CALENDAR }

// Task model additions:

source      TaskSource[]  // array, not single enum

metadata    Json?         // per-platform data

description String?       // body text with hashtag/mention support

### **3.2 CalendarEntry Model -- New**

New model for external display-only calendar events (holidays, birthdays, other people's events). Shown in planner view. No task created. Nothing syncs back to Google Calendar.

model CalendarEntry {

id            String    @id @default(cuid())

userId        String

integrationId String

externalId    String    // Google Calendar event ID

title         String

start         DateTime

end           DateTime

isAllDay      Boolean   @default(false)

color         String?   // calendar color from Google

createdAt     DateTime  @default(now())

@@unique([integrationId, externalId])

@@index([userId])

}

### **3.3 Workspace Model -- Current Spec**

planTier removed. WorkspaceColor enum. isPersonal flag. Auto-created on signup via Clerk webhook.

model Workspace {

id             String         @id @default(cuid())

name           String

slug           String         @unique

color          WorkspaceColor @default(INDIGO)

icon           String?

description    String?        // injected into AI system prompt

ownerId        String

isPersonal     Boolean        @default(false)

isArchived     Boolean        @default(false)

aiInstructions String?

defaultRepo    String?        // 'owner/repo'

defaultBoardId Int?           // Jira board ID

createdAt      DateTime       @default(now())

updatedAt      DateTime       @updatedAt

subscription   Subscription?  // only on Team/SMB workspaces

}

enum WorkspaceColor {

INDIGO VIOLET EMERALD AMBER ROSE SKY ORANGE PINK TEAL SLATE

}

## **4. AI Core -- Actual Implementation**

### **4.1 Tool Interface -- isAction Flag**

Every tool definition includes isAction: boolean. The orchestrator checks this after execution and only increments the action counter on successful action tools.

export interface Tool {

name:        string

description: string

parameters:  Record<string, unknown>

isAction:    boolean   // true = counts toward action limit on success

execute:     (params: unknown, ctx: ToolContext) => Promise<unknown>

}

### **4.2 Action vs Non-Action Tools**

| Tool | isAction | Reason |
| --- | --- | --- |
| create_task, update_task_status | true | Writes to Khove DB |
| create_jira_ticket, update_jira_ticket_status, add_jira_comment | true | Writes to external Jira |
| create_calendar_event, update_calendar_event, delete_calendar_event | true | Writes to Google Calendar |
| create_github_issue, comment_on_pr | true | Writes to GitHub |
| generate_standup | true | Composite action -- counts as 1 |
| get_upcoming_events, check_availability, list_tasks | false | Read only -- never counted |
| get_pull_requests, get_sprint_health, get_jira_boards | false | Read only -- never counted |

### **4.3 Redis Action Counter Keys**

// User-scoped pool (Free + Pro):

actions:user:{userId}:{YYYY-MM}

// Workspace-scoped pool (Team + SMB):

actions:ws:{workspaceId}:{YYYY-MM}

// NOTE: Old V1.0 message counter keys (usage:{userId}:{YYYY-MM})

// are deprecated. Do not use. They expire naturally.

### **4.4 Pre-Action Limit Check Pattern**

// Before executing any isAction=true tool:

if (tool.isAction) {

const { allowed, used, limit } = await checkActionLimit(userId, planTier, workspaceId)

if (!allowed) {

result = { blocked: true, reason: 'action_limit',

message: `You have used all ${limit} AI actions this month.`,

upgradeUrl: '/pricing' }

continue  // skip tool.execute()

}

}

// After successful execution:

if (tool.isAction && !(result as any)?.error) {

await incrementActionCount(userId, planTier, workspaceId)

}

## **5. Google Calendar -- Full Spec**

*This section supersedes Section 6 of V1.0 PRD. Implementation goes significantly beyond the original spec.*

### **5.1 Three-Category Sync**

| Category | Detection | Stored as | Sync direction |
| --- | --- | --- | --- |
| Actionable events | Has attendees OR conferenceData present OR user is organiser | Task with source=[GOOGLE_CALENDAR] + metadata JSON | Bidirectional |
| External events | User is not organiser AND no attendees AND not the primary calendar | CalendarEntry (display only) | GCal to Khove only |
| Khove tasks | Tasks created in Khove with due dates | Pushed to GCal as events | Khove to GCal only |

### **5.2 Google Meet -- What Is Stored in Task.metadata**

{

calendarEventId: string,   // Google Calendar event ID

meetLink: string,          // https://meet.google.com/...

agenda: string,

location: string,

attendees: string[],       // email addresses

startTime: string,         // ISO 8601

endTime: string,           // ISO 8601

timezone: string,          // e.g. 'Africa/Lagos'

originalDuration: number,  // minutes -- preserved on due date change

}

### **5.3 Due Date Sync Rule**

When a task with source=GOOGLE_CALENDAR has its due date changed: Khove calculates the new start time, preserves the original duration from metadata.originalDuration, computes the new end time, and pushes the update to Google Calendar. The metadata.startTime and metadata.endTime are updated accordingly.

### **5.4 Disconnect Cleanup -- Inngest Job**

- Delete all Tasks where source contains GOOGLE_CALENDAR for this user
- Delete all CalendarEntry records for this integration
- Stop the Google Calendar watch channel (channel.stop)
- Revoke the OAuth token
- Clear Redis keys: sync token, cache, sync status
- Soft-delete the Integration record (isActive = false)

### **5.5 Conflict Rules**

- GCal event updated externally: webhook fires, Inngest updates linked Task fields and metadata
- Khove task updated: if source includes GOOGLE_CALENDAR, push update to GCal event
- Task moved to DONE or CANCELLED: confirmation dialog warns about linked meeting
- GCal event deleted externally: Khove task remains, source updated, externalId cleared from metadata

## **6. Real-Time Layer -- SSE Implementation**

### **6.1 publishEvent()**

async function publishEvent(userId: string, event: object) {

const key = `sse:events:${userId}`

await redis.lpush(key, JSON.stringify({ ...event, ts: Date.now() }))

await redis.expire(key, 60)

}

### **6.2 SSE Endpoint**

// GET /api/realtime/events

// Response: text/event-stream

// Polls Redis every 3 seconds

// Auto-reconnect via EventSource on client

### **6.3 Client Integration**

// useRealtime() hook in layout:

const es = new EventSource('/api/realtime/events')

es.onmessage = () => router.refresh()

es.onerror = () => { es.close(); setTimeout(reconnect, 3000) }

### **6.4 What Must Call publishEvent()**

- All tRPC mutations that modify user-visible data (tasks, workspaces, integrations)
- All Inngest functions on completion (calendar sync, webhook processing)
- All OAuth callbacks on success
- All billing state changes

## **7. UI -- Actual State**

### **7.1 Design System**

| Colour use | Where | Value |
| --- | --- | --- |
| Red | Destructive buttons, delete confirmations, danger states | #E24B4A |
| Blue | #hashtag and @mention highlighting in task descriptions | #3B82F6 |
| Status dots | Small dots on task cards by StatusCategory | Emerald/Amber/Rose/Sky per category |
| Workspace color dots | 8px sidebar dot per workspace only | 10-color WorkspaceColor enum |

### **7.2 Navigation Changes From PRD**

| PRD spec | What was built |
| --- | --- |
| Fixed 240px sidebar | Collapsible sidebar: icon rail (collapsed) + expandable panel (expanded) |
| /calendar route | /planner -- renamed per user preference |
| Lucide-react icons throughout | Custom SVG nav assets: chat.svg, tasks.svg, planner.svg with filled/outlined active states |
| Generic integration display | Per-platform SVG logos as first-class assets: Google Calendar, Google Meet, GitHub, Jira |
| Standard task source display | Overlapping platform icon badges (stacked, Instagram-style) on task cards |

### **7.3 Task Table Improvements**

- Inline priority editing: PriorityCell with dropdown + optimistic PATCH (mirrors StatusCell pattern)
- Due date always editable: DueDateCell opens picker even when date already set
- Strikethrough on cancelled tasks: shown in table view and kanban
- Title-only navigation: row click does not navigate. Only task title (hover underline) links to detail page.

### **7.4 Chat Empty State**

Spline 3D scene that reacts to mouse movement and typing. Loaded async, does not block interaction. This is a deliberate product moment -- the first thing a new user sees should feel alive. Replaces the static suggestion chips from the PRD spec.

### **7.5 Typography Status**

Geist and Cal Sans are DEFERRED, not removed. System defaults are used currently. When the full UI design phase begins, load Geist via next/font and Cal Sans for display headings. The design token variables are already defined -- no token file changes needed.

## **8. Items Under Active Deliberation**

*Do not implement these until a decision is reached. Do not revert completed work while waiting for these decisions.*

| Item | Options | Decision trigger |
| --- | --- | --- |
| LangChain.js | Stay Vercel AI SDK only (permanent) OR introduce LangChain when tool orchestration grows to 15+ tools or multi-agent patterns are needed | Revisit after Phase 4 (GitHub) + Phase 5 (Jira) are complete and total tool count is known |
| Geist + Cal Sans fonts | Load via next/font during UI design phase OR stay on system fonts permanently for performance | Decide at start of full UI design phase. Likely load Geist. |
| Cloudflare R2 vs Supabase Storage | Cloudflare R2 (original spec) OR Supabase Storage (already in stack, simpler) | Decide when file upload features are scoped. Supabase Storage is a valid alternative. |

## **9. Phase Status & Next Steps**

| Phase | Status | Immediate next steps |
| --- | --- | --- |
| Phase 1 -- Foundation | Complete | Verify Clerk webhook creates Personal Workspace on every new signup |
| Phase 2 -- AI Core | Complete | Set ANTHROPIC_API_KEY. Test end-to-end: message creates task. |
| Phase 3 -- Google Calendar | Complete + expanded | Test: connect GCal, create meeting via AI, verify Meet link in task detail, test disconnect cleanup |
| Phase 4 -- GitHub | Code-complete, thin & partly broken | Plumbing exists (OAuth, client, AI tools, initial-sync, webhook, page). Gaps to close for the pivot: (a) **webhook bug** -- code reads `GITHUB_WEBHOOK_SECRET` but `.env.local` sets `GITHUB_APP_WEBHOOK_SECRET`, so every webhook fails signature check and is dropped (the "sensor" is deaf); (b) sync is a one-time snapshot of owned repos / open items only -- no refresh, misses org/collaborator repos; (c) no repo activity or write actions on the page; (d) sidebar "Connect GitHub" is a dead `action:true` button with no handler. |
| Phase 5 -- Jira | Not started | Set ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET. Register app on developer.atlassian.com. In V4, Jira is another **Thread source**, not a standalone silo. |
| Phase 6 -- Billing | Not started | Create Stripe products (Pro/Team/SMB monthly + annual). Set all billing env vars. Evolve toward agent-run metering (§14). |
| UI -- Full design | Not started | Load Geist. Use Stitch + 21st.dev + ui-ux-pro-max-skill. |
| **V4 Pilot -- Thread + PR Shepherd + MCP** | **DIRECTION -- next** | Make the Connectivity Thread real (§11); ship the GitHub PR Shepherd agent (§12) -- fixing the webhook bug as a prerequisite; expose a minimal Khove MCP server (§13). Smallest wedge that proves the orchestration pivot. |

## **10. Architecture Rules -- Non-Negotiable**

- NEVER store OAuth tokens in plaintext -- use lib/encryption.ts AES-256-GCM
- NEVER hardcode model IDs outside lib/ai/providers/ -- one change location
- NEVER let tool failures crash a conversation -- try/catch every tool.execute()
- NEVER trust checkout success redirect -- wait for Stripe/Paystack webhook
- NEVER expose billingProvider to the client -- frontend sees tier and status only
- NEVER set Jira status directly -- fetch transitions, find match, execute transition ID
- NEVER use plain text or markdown in Jira fields -- always ADF format
- NEVER process GitHub or Google webhooks synchronously -- return 200, dispatch to Inngest
- ALWAYS use PLANS constant in lib/billing/plans.ts -- no plan logic elsewhere
- ALWAYS check installationId before GitHub API calls -- may not be set yet
- ALWAYS use https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/ for Jira
- ALWAYS use StatusCategory for AI status operations -- never raw status name strings
- ALWAYS call publishEvent() after any mutation that affects user-visible data
- ALWAYS store per-platform data in Task.metadata -- not in separate columns
- **NEVER write repository code or compete with coding agents** -- Khove orchestrates and dispatches; it does not generate PR-level code. (V4 positioning rule.)
- **Agent writes are gated behind human approval by default** -- "agent proposes, human approves." Autonomy is opt-in per agent per workspace, never on by default.
- **Every agent action is audited** -- log to AiUsageLog (+ SSE event) with the agent id, Thread id, tool, and inputs. No silent autonomous mutations.
- **MCP write and agent-invoke actions are metered and plan-gated** -- reads may be cheap; anything that mutates an external system or starts an agent-run counts.

## **11. Connectivity Thread** *(DIRECTION -- not yet built)*

The core primitive of the V4 pivot. A **Thread** is one unit of work whose lifecycle spans tools and people.

- **What it groups:** links across GitHub (PRs, issues, commits, checks), Jira (epics/issues), Google Calendar (review/standup events), and the people involved -- into one timeline.
- **Relationship to today's schema:** it is the evolution of the existing multi-source `Task` model. A `Task` already carries `source TaskSource[]` and namespaced `metadata` (`github`, `googleCalendar`, `jira`). A Thread is a grouping layer above tasks/links -- likely a new `Thread` model plus a join to `Task` and to external references -- **not** a rewrite of the task model.
- **Why it matters:** the Thread is the object agents operate on and the durable cross-context memory of a team's work. That memory -- not the agents themselves -- is Khove's moat.
- **Scoping:** workspace-scoped like everything else; every Thread query filters by `workspaceId`.

## **12. Agent Runtime & the GitHub PR Shepherd** *(DIRECTION -- not yet built)*

Khove runs durable, event-driven **agents** on top of the existing infrastructure.

- **Substrate (already present):** Inngest provides durable steps, concurrency, and cron -- this is the agent execution engine. An agent = an Inngest function running a Vercel AI SDK tool loop. SSE `publishEvent` / `publishWorkspaceEvent` is the live activity feed. `AiUsageLog` + action counters are the metering/audit rails. Per-workspace encrypted tokens let an agent act as the workspace's own integration identity.
- **First agent -- GitHub PR Shepherd:**
  - **Trigger:** real GitHub webhooks (`pull_request`, `pull_request_review`, `issue_comment`, check/CI events) → Inngest. **Prerequisite:** fix the webhook secret env-name mismatch (see §9) so the sensor works.
  - **Behavior:** attach the PR to its Thread; write a PM-readable summary of what changed; flag when a PR's scope has grown beyond its linked ticket; nudge idle reviewers; keep the Thread status current.
  - **Evidence-backed output (required):** every insight the Shepherd surfaces cites its sources -- it never emits bare prose. The canonical shape is a signal + confidence + evidence + sources block, e.g. *"Risk: HIGH · Confidence 84% · 3 PRs stale >5 days, linked ticket still In Progress, CI failing on `main` · Sources: [PR-482] [KHOVE-123] [check: build]".* Facts and predictions are visibly distinguished. This is what makes an agent trustworthy rather than a chatbot; it is not optional.
  - **Actions (gated) -- read / write / delete governance:** reads are automatic (free); **writes** (comment, label, request review) are **human-approval by default**, opt-in autonomy per workspace; **destructive / high-impact actions** (close, merge, delete) always require explicit approval. Every action is audited (actor agent id, Thread id, tool, inputs, approver) via `AiUsageLog` + an SSE event.
- **Sequencing:** Shepherd first (safe, demoable). Spec→Dispatch handoff (create ticket/branch, hand to an external coding agent, track back) is a later agent.

## **13. MCP Server -- Khove as a Provider** *(DIRECTION -- not yet built)*

The first surface that takes Khove *outside* Khove.

- **What:** an MCP server exposing Khove's Threads, cross-context graph, and integration actions, so Cursor / Claude Code / Codex / Claude Desktop can pull Khove context into the developer's editor.
- **Minimal pilot resources:** `list_threads`, `get_thread`, `post_update` (read + a gated write). Grows to expose integration actions (e.g. comment on the PR for this Thread).
- **Auth & gating:** authenticated per user/workspace; reads cheap, writes and agent-invokes metered and plan-gated (entitlements per §14). Re-exposes the existing Vercel AI SDK `tool()` catalog rather than duplicating logic.
- **Why first:** highest leverage, least new UI -- it makes "Khove's context follows you into your IDE" real. Plugins / marketplace and a `khove` CLI are Act 2, not committed here.

## **14. Metering Evolution -- Agent-Runs & Entitlements** *(DIRECTION)*

The metered unit shifts from single AI actions to **agent-runs** (a durable multi-step agent execution against a Thread) plus **platform entitlements**: concurrent agents, custom vs private agents, autonomous-write permission, MCP write access & seats, CLI-in-CI runs. Reads/chat stay cheap; autonomous work is metered. This evolves from the existing Redis action counters + `AiUsageLog`; the pricing tiers in the Concept Note remain the anchor. `billingProvider` stays server-only; the client still sees only `tier` + `status`.

## **15. The V4 Pilot -- Scope & Sequence** *(DIRECTION -- next)*

The pilot is the smallest wedge that proves the pivot. It is **not** the platform. The framing is deliberately narrow and demoable: *companies don't have a project-management problem, they have a context problem* -- the pilot proves Khove can hold that context, reason over it, and act on it under governance.

**What the pilot ships (in order):**

1. **Connectivity Thread as a real object** -- new `Thread` + `ThreadLink` Prisma models (workspace-scoped) grouping a GitHub PR ↔ Jira ticket ↔ Calendar review into one timeline. No graph database; two tables (§11).
2. **GitHub sensor fixed** -- resolve the webhook secret env-name mismatch (§9) so events actually arrive. Prerequisite for everything agentic.
3. **One agent -- the GitHub PR Shepherd** (§12) -- event-driven, evidence-backed output, read/write/delete governance, human-approval by default, fully audited.
4. **Minimal MCP server** (§13) -- `list_threads` / `get_thread` / `post_update`, so the same Thread context is usable inside Cursor / Claude Code. First "outside Khove" surface.
5. **Memory layer** (§16) -- Threads and the Shepherd write to and recall from mem0, tenant-safely.

**The pilot's product posture:** *proactive, not a chatbot.* The win state is a Thread view (and a morning digest) that answers "what's happening with X, is it on track, and why" with evidence and sources -- **Observe → Understand → Predict → Recommend → Act**, where the pilot delivers Observe/Understand/Recommend and *governed* Act, and defers Predict-at-scale to the Intelligence-Graph phase.

**Success signal:** a PM who never opens GitHub can answer "is the SSO work on track, and why?" from Khove with cited evidence -- and a developer pulls that same Thread context into their IDE via MCP without switching tabs.

## **16. Memory Architecture -- mem0** *(DIRECTION -- not yet built)*

The Thread is the durable memory of a team's work; **mem0 is the engine that makes that memory semantic, structured, and recallable.** It supersedes today's crude memory (`lib/ai/memory.ts` -- a single Redis blob per user, re-summarised every 10 messages, 2000-char cap). Redis stays for the SSE queue and action metering; mem0 owns memory.

### 16.1 Deployment -- self-hosted, data stays in-house

mem0 runs **self-hosted (OSS)**, not the hosted cloud -- a B2B/B2C dev product must not ship customer conversation and project data to a third-party memory processor. Wiring, all on the existing stack (no new vendor):

- **Vector store:** `pgvector` on the existing Supabase Postgres.
- **Embedder:** Gemini embeddings via the existing `GOOGLE_GENERATIVE_AI_API_KEY` (keeps the stack Anthropic + Google; no OpenAI dependency).
- **Extraction LLM:** the existing providers (`gemini-2.5-flash-lite` for cost) -- mem0 makes one extraction call per *add*, so adds are batched (see 16.4).
- **Graph memory (deferred):** mem0's entity-relationship graph (people → teams → projects → PRs) is the seed of the "Intelligence Graph" moat; not in the pilot.

### 16.2 Scoping -- the tenant-safety crux (non-negotiable)

The isolation boundary is **`workspaceId`**. Every `add` and `search` is namespaced by it; **mem0 is never called raw** -- all access goes through a single `scopedMemory(workspaceId, userId)` wrapper that injects the `workspaceId` filter and refuses any query missing it. There are two scopes, and the distinction is what makes "context across workspaces" safe:

| Scope | mem0 keying | Holds | Travels across a user's workspaces? |
|---|---|---|---|
| **Workspace memory** | filter `workspaceId` (+ `userId` in metadata) | Work content: decisions, project context, Thread history | **No** -- never crosses a workspace boundary |
| **Personal memory** | `user_id` + `scope:"personal"` | **Preferences and working style only -- content-free** | **Yes** -- safely, because it carries no tenant work content |

This resolves "context integrity across workspaces" precisely: a *user's preferences* follow them everywhere; a *company's work content* never leaves its workspace. Cross-tenant content bleed -- the worst B2B failure mode -- is structurally prevented, not merely policed.

### 16.3 Three memory tiers (how mem0 links to the Thread & agents)

mem0 is not just chat memory; it is the platform's memory substrate, keyed at three levels:

1. **Conversation memory** -- scoped `(userId, workspaceId)`. Recalled before generation, written after. Replaces the Redis summary.
2. **Thread memory** -- `run_id = threadId` (+ `workspaceId` filter). When the PR Shepherd works a Thread, it writes learnings/decisions here; re-engaging the Thread recalls them, giving agents continuity across events.
3. **Agent memory** -- `agent_id` + `workspaceId`. The Shepherd's cross-Thread learnings ("this repo's reviewers stall on Fridays", "this team marks tickets Done before merge") accumulate here, isolated per workspace. This is the compounding, hard-to-copy asset -- the pilot's seed of the Intelligence Graph.

Memories carry source metadata (`sourceTaskId`, PR number, ticket key) so recalled context is **citable**, reinforcing the evidence-backed posture (§12).

### 16.4 Code integration points

- `lib/ai/memory.ts` becomes a thin wrapper over `scopedMemory`: `recall(query)` → `mem0.search(query, filters={workspaceId})`; `remember(messages)` → `mem0.add(...)`. Batched every ~10 turns (mirrors today's cadence) to bound extraction cost.
- `lib/ai/index.ts` (`runAIConversation`): recall relevant memories *before* generation, pass them into `assembleSystemPrompt`; `remember` *after*, async.
- `lib/ai/context.ts`: the existing `userMemorySummary` slot becomes injected **recalled memories** (top-k, with sources).
- Every mem0 call is `try/catch`-wrapped -- a memory failure never crashes a conversation (architecture rule).
- **Plan-gated retention:** FREE's 7-day retention (today unenforced) becomes an age filter/prune on recall + a scheduled Inngest sweep, per `PLANS`.

## **17. Data Integrity Posture (B2B + B2C)** *(DIRECTION)*

Security is a product feature, not a checkbox -- but pilot-appropriate, not enterprise-heavy. The pilot's posture, in layers already largely present:

- **Least privilege / permission-aware:** *the AI can only know what the requesting user is allowed to know* -- every retrieval and tool call is workspace-scoped and honours the user's membership/role.
- **Credential isolation:** raw OAuth tokens never reach a model -- AES-256-GCM at rest (`lib/encryption.ts`), decrypted only inside integration helpers.
- **No cross-tenant memory bleed:** enforced by the `scopedMemory` boundary (§16.2).
- **Auditability:** every agent action logged (who/what/when/which tenant/which tool/which model/approved-by).
- **Model-provider data terms:** run on **Anthropic + Google direct** under default no-training terms + a DPA. **ZDR is not a pilot toggle** -- it is requested from Anthropic when an enterprise deal requires it; the default commercial terms (no training on API data) suffice for the pilot. Note the free-tier Gemini path is the weaker data-residency link -- move it to **Vertex AI** before Bedrock if an enterprise asks.

Enterprise-grade controls (KMS/VPC/CloudTrail, per-tenant vector isolation, a unified cross-system permission model, SOC2/HIPAA, redaction pipelines) are **deferred to the enterprise phase** (§18).

## **18. Pilot vs Vision -- What We Are Deliberately NOT Building Yet**

The broader thesis is *a secure AI intelligence and orchestration layer for product & engineering work* -- but the pilot must resist becoming that platform on day one. Explicitly **out of the pilot** (each is real, each is later):

- Multi-provider **AI gateway** (Bedrock / Anthropic / Vertex routing) -- `lib/ai/providers/` already isolates model IDs; we *evolve into* the abstraction by adding a provider when a deal needs it, not by pre-building the gateway.
- A full **MCP/policy gateway** enforcing rate limits, sensitive-data filtering, prompt-injection defence, tool-output validation -- pilot needs only workspace scoping + approval-gating + audit.
- A real **graph database** for the Intelligence Graph -- pilot is `Thread` + `ThreadLink` tables.
- **mem0 hosted cloud**, redaction pipelines, confidence-scoring infra, a unified cross-system permission model.
- **Breadth of integrations** ("50 connectors") -- pilot is GitHub deep (plus existing Calendar/Jira). Integrations are a means, not the product.
- Plugins / marketplace / `khove` CLI -- Act 2.

*MCP is valuable plumbing -- but still plumbing.* The moat is the permission-aware, evidence-backed Thread and the per-workspace memory that accumulates on it -- not the connectors, the model, or MCP itself.

*Khove.io  |  Technical PRD V1.4  |  Confidential  |  Kigali & Lagos 2025*
