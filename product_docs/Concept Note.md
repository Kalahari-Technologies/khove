**CONCEPT NOTE -- V3**

**Khove.io**

*Your tools, finally thinking together.*

AI-native task and workflow intelligence for individuals and dev teams

Kigali & Lagos  |  2025  |  Confidential

## **1. Executive Summary**

Khove is an AI-native platform that acts as the intelligence layer connecting GitHub, Jira/Atlassian, and Google Calendar. Users manage work through a single conversational AI interface rather than manually coordinating across disconnected tools.

This version reflects the actual product being built -- including deliberate architecture simplifications, product improvements discovered during implementation, and design decisions made in code. It supersedes V1 and V2.

Khove is AI-native by design. All three integrations are available to every user including the free tier. Conversations are unlimited at every tier. Monetisation is built around AI actions (write operations the AI performs in external systems), workspace scale, and team intelligence features.

The beachhead market is SMB and startup dev teams in Kigali (Rwanda) and Lagos (Nigeria). The founding team is embedded at African Leadership University (ALU) in Kigali from April 2025.

## **2. The Problem**

Modern software teams operate across four or more tools simultaneously. GitHub for code, Jira for issue tracking, Google Calendar for scheduling, Slack for communication. Each tool is excellent in isolation. None communicate intelligently with each other.

- Context switching costs: Developers lose an estimated two hours per day moving between tools to gather information that should surface automatically.
- Manual coordination overhead: Standups, sprint reviews, and status updates are largely manual. Someone must compile information from GitHub and Jira before every meeting.
- No unified AI layer: While individual tools have begun adding AI features internally, no product provides a conversational AI intelligence layer that works across all tools a team uses simultaneously.

## **3. The Solution**

### **3.1 Core Philosophy**

Khove does not replace GitHub, Jira, or Google Calendar. It connects them. Every user gets all three integrations from day one. Conversations with the AI are unlimited at every tier. What scales with paid plans is the number of AI actions, the number of workspaces, team collaboration features, and advanced intelligence.

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

## **5. Build Status**

| Phase | Status | Notes |
| --- | --- | --- |
| Phase 1 -- Foundation | Complete | Clerk, Prisma/Supabase, Upstash Redis, AES-256-GCM encryption, task CRUD |
| Phase 2 -- AI Core | Complete | Vercel AI SDK only (no LangChain). Tool-calling, agentic loop, action metering working. |
| Phase 3 -- Google Calendar | Complete + expanded | 3-category sync, full Meet integration, bidirectional sync, background jobs via Inngest, SSE realtime |
| Phase 4 -- GitHub | Not started | GitHub App config required before starting |
| Phase 5 -- Jira | Not started | Atlassian OAuth config required before starting |
| Phase 6 -- Billing | Not started | Multi-provider schema already designed in Subscription model |
| UI -- Full design | Not started | B&W system active. Fonts (Geist/Cal Sans) deferred. Start after Phases 4+5. |

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
