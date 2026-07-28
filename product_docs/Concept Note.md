**CONCEPT NOTE -- V4**

**Khove.io**

*Your tools, finally thinking together.*

AI-native orchestration for Product & Dev teams

Kigali & Lagos  |  2025  |  Confidential

> **V4 pivot (this version).** Khove is repositioned from a *conversational AI over your tools* into an **AI-native orchestration platform**. Four changes define V4: (1) **Positioning** -- Khove is an *orchestrator, not a code-writer*; it sits above the repo and does not compete with Cursor / Claude Code / Codex. (2) **The Connectivity Thread** becomes the core primitive -- one piece of work whose lifecycle spans GitHub / Jira / Calendar / people. (3) **Agents across the thread** -- durable, event-driven workers; the first is the **GitHub PR Shepherd**. (4) **Khove-as-a-provider via MCP** -- Khove's context and actions are exposed so they can be used *outside* Khove (inside Cursor / Claude Code / Codex). Everything below the conversational layer in V4 is **direction**; the shipped product today is still the V3 conversational layer. Supersedes V1--V3.

## **1. Executive Summary**

Khove is an AI-native orchestration platform that connects GitHub, Jira/Atlassian, and Google Calendar into a single **connectivity thread**, then runs **agents** across that thread to reduce the context-switching that fragments modern Product & Dev work. Today users manage work through a conversational AI interface; the V4 direction adds always-on agents and exposes Khove's own context and actions to other tools via MCP.

The sharper way to say what Khove is for: **companies don't have a project-management problem -- they have a context problem.** Their work context is scattered across a dozen tools, so a delay that's obvious in hindsight is invisible in any single system. Khove is the layer that holds that context, understands what's happening, and -- when authorised -- acts on it. It is **proactive, not a chatbot**: the goal is not "ask me anything about your tools" but "here is what you need to know this morning, with the evidence."

Khove is an **orchestrator, not a code-writer**. It sits *above* the repository: it turns product intent into dispatched dev work and tracks it home. It may hand work off to coding agents (Cursor, Claude Code, Codex, GitHub's coding agent) -- it never tries to out-code them. The defensible layer is the connective tissue and org memory of the work itself, not code generation.

This version reflects both the actual product being built and the locked forward direction. Conversational, implementation-accurate detail is retained; new agentic / thread / MCP concepts are marked as direction (not yet built).

Khove is AI-native by design. All three integrations are available to every user including the free tier. Conversations are unlimited at every tier. Monetisation is built around AI actions today, evolving toward **agent-runs and platform entitlements** (see Section 4), always gated by plan.

The beachhead market is SMB and startup dev teams in Kigali (Rwanda) and Lagos (Nigeria). The founding team is embedded at African Leadership University (ALU) in Kigali from April 2025.

## **2. The Problem**

Modern software teams operate across four or more tools simultaneously. GitHub for code, Jira for issue tracking, Google Calendar for scheduling, Slack for communication. Each tool is excellent in isolation. None communicate intelligently with each other.

- Context switching costs: Developers lose an estimated two hours per day moving between tools to gather information that should surface automatically.
- Manual coordination overhead: Standups, sprint reviews, and status updates are largely manual. Someone must compile information from GitHub and Jira before every meeting.
- No unified AI layer: While individual tools have begun adding AI features internally, no product provides a conversational AI intelligence layer that works across all tools a team uses simultaneously.

## **3. The Solution**

### **3.1 Core Philosophy**

Khove does not replace GitHub, Jira, or Google Calendar. It connects them. And it does not replace the coding agents developers already use -- it **orchestrates around them**. Every user gets all three integrations from day one. Conversations with the AI are unlimited at every tier. What scales with paid plans is the number of AI actions (evolving to agent-runs), the number of workspaces, team collaboration features, agent autonomy, and advanced intelligence.

**Positioning discipline:** Khove is an orchestrator, not a code-writer. The moment it tries to out-code Cursor / Claude Code / Codex, it loses. Khove owns the layer *above the repo* -- product intent → spec → ticket → branch → PR → review → release -- and dispatches the actual code work to whichever coding agent the team already uses.

### **3.1a The Connectivity Thread** *(direction)*

The core primitive of V4. A **Thread** is one piece of work whose lifecycle spans tools -- e.g. "Add SSO" = a Jira epic + three GitHub PRs + a design doc + a Thursday review on Calendar + the people involved. The Thread is the single place the whole story lives, and it is the object agents operate on. It is the natural evolution of today's multi-source task model (a task already carries a `source[]` array and per-platform metadata); a Thread groups these cross-tool signals into one timeline. The Thread -- the durable, cross-context memory of a team's work -- is Khove's defensible layer.

### **3.1b Agents Across the Thread** *(direction)*

Beyond the conversational layer, Khove runs **agents**: durable, event-driven workers that watch a Thread and act on it. The first is the **GitHub PR Shepherd** -- triggered by real GitHub webhooks, it keeps the Thread current, writes PM-readable summaries of what a PR changed, flags when a PR has grown beyond the scope of its linked ticket, and nudges idle reviewers. Agents take write actions (comment, label, request review) **behind human approval by default** -- "agent proposes, human approves" -- earning autonomy per-agent as trust is established. Every agent action is audited. Because integration tokens are per-workspace, an agent can act as the workspace's own GitHub identity -- a first-class bot teammate, not a person clicking buttons.

### **3.1c Khove as a Provider -- MCP** *(direction)*

The first surface that takes Khove *outside* Khove. Khove exposes its Threads, cross-context graph, and integration actions as an **MCP server**, so the same context is usable inside Cursor / Claude Code / Codex / Claude Desktop. This is the sharpest expression of the anti-context-switch thesis: Khove's memory of the work follows the developer into their editor. Reads are cheap; write and agent-invoke actions are metered and plan-gated. Plugins / marketplace and a `khove` CLI are the next surfaces (Act 2) but are not committed in this version.

**Why this wins (differentiation).** Cursor / Copilot Workspace / Devin own "AI inside the repo." Linear owns dev workflow but has no cross-tool AI or calendar. Notion owns docs. None own the orchestration layer that connects product intent to dispatched dev execution across every tool a team uses, with a durable cross-context memory and agents that operate on it. That connective layer -- not another code-writer -- is Khove.

### **3.1d The Operating Loop & the Pilot** *(direction)*

The platform progressively moves along one loop: **Observe → Understand → Predict → Recommend → Act.** It reads the signals (PRs, tickets, calendar), understands the state ("the payments work is likely to slip"), predicts the driver ("auth dependency unresolved, review activity down"), recommends ("pull auth into this sprint, trim Feature X"), and -- with permission -- acts (open the ticket, notify the lead). Every step is **evidence-backed**: a signal with confidence and cited sources, with facts and predictions clearly distinguished -- the difference between a trustworthy teammate and a chatbot.

The **pilot** delivers a governed slice of that loop, not the whole platform: the **Connectivity Thread** (a GitHub PR ↔ Jira ticket ↔ Calendar review, unified), one **GitHub PR Shepherd** agent (event-driven, evidence-backed, human-approval by default), a **minimal MCP server** so that context follows the developer into Cursor / Claude Code, and a **memory layer** (mem0, self-hosted, tenant-scoped) so Threads and agents remember. Governance is built in from day one -- **reads are automatic, writes need approval, destructive actions need explicit approval**, and every action is audited. Success is simple: a PM who never opens GitHub can answer *"is the SSO work on track, and why?"* from Khove, with sources.

### **3.2 What an AI Action Is**

The distinction between a conversation and an action is intuitive and central to the model. Reading is always free. Doing costs an action.

| Type | Examples | Counted? |
| --- | --- | --- |
| Conversation (always free) | Ask about sprint status, list open PRs, summarise calendar, discuss blockers, query meeting details | Never |
| Action (counted) | Create Jira ticket, schedule Calendar event, create GitHub issue, comment on PR, create Khove task, update ticket status, generate standup | Yes -- 1 per action |

### **3.3 Google Calendar -- Three-Category Sync**

The Google Calendar integration implements a three-category sync model that goes significantly beyond the original spec:

| Category | How detected | Stored as | Sync direction |
| --- | --- | --- | --- |
| Actionable events | Has attendees, or conferenceData present, or user is organiser | Task with source=[GOOGLE_CALENDAR] + metadata JSON | Bidirectional -- Khove changes push back to GCal |
| External events | User is not organiser, no attendees, holiday/birthday calendars | CalendarEntry -- display only, no task | GCal to Khove only. Nothing syncs back. |
| Khove tasks | Tasks created in Khove that user wants on their calendar | Pushed to GCal on create/edit | Khove to GCal only |

Google Meet integration is fully implemented. Meeting tasks store Meet link, agenda, attendees, location, and start/end times in Task.metadata. Changing a task's due date automatically adjusts meeting start/end times, preserving the original duration.

### **3.4 Workspace Model**

Every user gets a Personal Workspace automatically on signup. Tasks, integrations, AI conversations, and memory are all scoped to workspaces. The Personal Workspace cannot be deleted.

Free users can create one additional workspace. Both support up to 4 members (owner + 3 guests). Pro users get 5 workspaces. Team and SMB users get unlimited workspaces.

### **3.5 Real-Time Architecture**

A custom Server-Sent Events (SSE) layer replaces Pusher/Supabase Realtime. Every mutation publishes an event to Redis via 2 commands (LPUSH + EXPIRE). A persistent SSE connection per authenticated tab polls Redis every 3 seconds and triggers a UI refresh when events arrive. Zero external dependencies, works natively on Vercel serverless.

### **3.6 Design System**

Khove's UI is strictly monochrome -- pure black and white with white/opacity tokens for depth. This is a permanent product decision. The only colour exceptions are red for destructive actions, blue for hashtag/mention highlighting in task descriptions, and small status indicator dots on task cards.

Custom SVG nav assets with filled/outlined states for active/inactive. Platform logos (Google Calendar, Google Meet, GitHub, Jira) are first-class SVG assets. The chat empty state features a Spline 3D scene that reacts to mouse movement and typing.

## **4. Business Model**

### **4.1 Pricing Tiers**

| Feature | Free | Pro | Team | SMB |
| --- | --- | --- | --- | --- |
| Price | $0 | $9/mo | $18/user/mo | $35/user/mo |
| Trial | -- | 14 days, card required | 14 days, card required | 21 days, card required |
| Workspaces | 2 | 5 | Unlimited | Unlimited |
| Max members per workspace | 4 (owner + 3 guests) | 4 (owner + 3 guests) | 20 | 50 |
| AI conversations | Unlimited | Unlimited | Unlimited | Unlimited |
| AI actions/month | 20 (user-scoped) | Unlimited | 500 per workspace | 2,000 per workspace |
| All integrations | Yes | Yes | Yes | Yes |
| Persistent AI memory | 7-day only | Full persistent | Full persistent | Full persistent |
| Standup AI | No | Yes | Yes | Yes |
| Custom AI instructions | No | Yes | Yes | Yes |
| Team memory | No | No | Yes | Yes |
| Sprint intelligence & retrospectives | No | No | No | Yes |
| Admin dashboard & usage analytics | No | No | No | Yes |
| Priority support | No | No | No | Yes |

### **4.2 Annual Pricing**

| Tier | Monthly | Annual | Per month annually |
| --- | --- | --- | --- |
| Pro | $9/mo | $90/yr | $7.50 |
| Team | $18/user/mo | $180/user/yr | $15.00 |
| SMB | $35/user/mo | $350/user/yr | $29.17 |

### **4.3 Action Counting Rules**

- Free tier: 20 actions/month shared across all workspaces the user owns. Pool is user-scoped.
- Pro: Unlimited. No pool.
- Team and SMB: Pool is per workspace. Each workspace gets its own independent pool.
- Conversations, queries, and read operations never count at any tier.
- Failed actions (external API error) do not count. Counter increments only on success.
- Counter resets on the 1st of each month. No rollover.

### **4.4 Metering Evolution -- Agent-Runs & Entitlements** *(direction)*

Action-based metering was the right value-metric for a conversational tool. As Khove becomes an agent platform, the metered unit shifts from single AI actions to **agent-runs** (a durable, multi-step agent execution against a Thread) plus **platform entitlements**. Reads and chat stay cheap; *autonomous work* is what scales with team value and is worth metering. Directional entitlement axes, all plan-gated:

| Axis | Free | Paid tiers scale up |
| --- | --- | --- |
| Agent-runs / month | small allowance | higher / unlimited |
| Concurrent agents | 1 | more |
| Custom & private agents | official only | custom, then private/org-published |
| Autonomous writes (no human approval) | off | opt-in per agent |
| MCP write access & seats | read-focused | write + more seats |
| CLI in CI / automation | manual only | metered CI runs |

The existing action counters and usage log are the substrate this evolves from; the pricing tiers in 4.1 remain the anchor.

## **5. Build Status**

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1 -- Foundation | Complete | Clerk, Prisma/Supabase, Upstash Redis, AES-256-GCM encryption, task CRUD |
| Phase 2 -- AI Core | Complete | Vercel AI SDK only (no LangChain). Tool-calling, agentic loop, action metering working. |
| Phase 3 -- Google Calendar | Complete + expanded | 3-category sync, full Meet integration, bidirectional sync, background jobs via Inngest, SSE realtime |
| Phase 4 -- GitHub | Code-complete, thin | OAuth + client + AI tools + initial-sync + webhook + page all exist and typecheck. But the page is a shallow one-time snapshot (owned repos, open items only), has no refresh, and the webhook path is broken by an env-name mismatch. "Code complete" ≠ usable. |
| Phase 5 -- Jira | Not started | Atlassian OAuth config required. Recontextualised in V4 as another Thread source, not a standalone silo. |
| Phase 6 -- Billing | Not started | Multi-provider schema already designed in Subscription model. Evolve toward agent-run metering (Section 4.4). |
| UI -- Full design | Not started | B&W system active. Fonts (Geist/Cal Sans) deferred. |
| **V4 Pilot -- Thread + PR Shepherd + MCP** *(direction)* | Proposed | The smallest wedge that proves the pivot: make the Connectivity Thread a real object (GitHub PR ↔ Jira ticket ↔ Calendar review), ship one event-driven agent (GitHub PR Shepherd, which forces fixing the deaf-webhook bug), and expose a minimal Khove MCP server so the same context is usable in Cursor / Claude Code. Success: a PM who never opens GitHub can answer "what's happening with X and is it on track?" from Khove -- and a dev gets that Thread context inside their IDE without switching tabs. |

## **6. Market & GTM**

| Market | Size | Description |
| --- | --- | --- |
| TAM | $47B | Global project management and productivity software |
| SAM | $8.2B | AI productivity tools for developer teams globally |
| SOM | $320M | African and diaspora SMB dev teams (5-year) |

### **6.1 Launch Phases**

| Phase | Timeline | Goal |
| --- | --- | --- |
| Pre-launch | Days 1-30 | 200 waitlist signups from ALU + Lagos/Kigali dev communities |
| Beta | Days 31-60 | 50 active users, 5 paying workspaces, personal onboarding for every team |
| Public launch | Days 61-90 | Product Hunt + Hacker News + African tech press. 100 users, $342 MRR. |

### **6.2 Year 1 Revenue Projection**

| Month | Free | Pro | Team Users | SMB Users | MRR |
| --- | --- | --- | --- | --- | --- |
| Month 2 | 50 | 5 | 0 | 0 | ~$45 |
| Month 4 | 200 | 20 | 9 | 0 | ~$342 |
| Month 6 | 500 | 50 | 30 | 0 | ~$990 |
| Month 9 | 1,200 | 120 | 90 | 20 | ~$4,580 |
| Month 12 | 2,500 | 250 | 180 | 50 | ~$10,300 |

*Khove.io  |  Concept Note V3  |  Confidential  |  Kigali & Lagos 2025*
