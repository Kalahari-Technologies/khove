**TECHNICAL PRD -- V1.2**

**Khove.io**

*Implementation-accurate specification*

Kigali & Lagos  |  2025  |  Confidential

## **0. Document Purpose & Version History**

This is the authoritative technical specification for Khove V1. It reflects the actual codebase, not the original planned architecture. All prior PRD versions are superseded by this document.

| Version | Key changes |
| --- | --- |
| V1.0 (original) | LangChain + Pusher + Zustand + indigo-violet design + message-based metering |
| V1.1 | Action-based metering, workspace model, planTier removed from Workspace, Pro trial card required |
| V1.2 (this) | Reflects actual implementation: Vercel AI SDK only, custom SSE realtime, B&W design, expanded task schema, 3-category calendar sync, Google Meet, deliberation items documented |

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
| Phase 4 -- GitHub | Not started | Set GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, GITHUB_CLIENT_ID/SECRET. Create GitHub App. |
| Phase 5 -- Jira | Not started | Set ATLASSIAN_CLIENT_ID, ATLASSIAN_CLIENT_SECRET. Register app on developer.atlassian.com. |
| Phase 6 -- Billing | Not started | Create Stripe products (Pro/Team/SMB monthly + annual). Set all billing env vars. |
| UI -- Full design | Not started | Do not start until Phases 4+5 complete. Load Geist. Use Stitch + 21st.dev + ui-ux-pro-max-skill. |

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

*Khove.io  |  Technical PRD V1.2  |  Confidential  |  Kigali & Lagos 2025*
