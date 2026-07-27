**CLAUDE CODE CONTEXT NOTE**

**Khove.io**

*Feed this to Claude Code at the start of every session.*

Version 1.0  ·  2025  ·  Kigali & Lagos

## **What Khove Is**

Khove (khove.io) is an AI-native SaaS platform that connects GitHub, Jira/Atlassian, and Google Calendar through a single conversational AI interface. It is not a task manager, not a project management replacement, and not another ClickUp. Khove sits between the tools teams already use and makes them function as a single coherent system.

The one-sentence pitch: Your tools, finally thinking together.

The core differentiation: ClickUp tries to replace your tools. Linear owns dev workflows but has no AI and no Calendar. Khove connects everything you already use, and adds AI that actually takes action — not just talks.

## **Who It Is For**

Primary: SMB startup dev teams of 3–50 people. Secondary: individual developers, PMs, and freelancers as the acquisition funnel (they bring it to their teams). Beachhead market: Kigali (Rwanda) and Lagos (Nigeria). The founding team is embedded at African Leadership University (ALU), Kigali.

Target ICP in one sentence: A 5–15 person Lagos or Kigali startup with a dev team juggling GitHub PRs, a Jira board, and a chaotic Google Calendar — and no AI helping them connect the dots.

## **Two-Module Structure**

| Module | Users | Integrations | Key AI Actions |
| --- | --- | --- | --- |
| Individual (Solo/Pro) | Solo devs, PMs, freelancers | Google Calendar + GitHub | NL task creation, schedule meetings, check PRs, persistent memory |
| Team + SMB | Dev teams 3–50 people | GitHub + Jira + Calendar | Standup automation, sprint health, blocker detection, sprint retrospective |

Individual Free is the acquisition engine. Individual Pro ($9/mo flat) is the personal upsell. Team ($18/user/mo) and SMB ($35/user/mo) are the revenue engine. Enterprise is out of V1 scope.

## **Tech Stack — Complete**

| Layer | Technology |
| --- | --- |
| Framework | Next.js 14 App Router — TypeScript throughout |
| Auth | Clerk — handles Google + GitHub OAuth, user webhooks to PostgreSQL |
| Database | PostgreSQL via Supabase. ORM: Prisma. directUrl for migrations. |
| Cache + Metering | Redis via Upstash. AI usage counters, OAuth state, memory, stale PR cache. |
| AI Models | Gemini 2.5 Flash (free/simple), Claude Haiku (paid/medium), Claude Sonnet (SMB/complex) |
| AI Orchestration | LangChain.js + Vercel AI SDK. Tool-calling. Max 5 loop iterations. |
| Background Jobs | Inngest. All webhooks processed async. Cron jobs for stale PR scan + webhook renewal. |
| Integrations | GitHub App (@octokit/app), Google Calendar API (googleapis), Atlassian OAuth 2.0 |
| Billing | Stripe (NG/GH/KE/ZA/EG), Paystack (RW + expanding), Flutterwave (UG/TZ/CM + fallback) |
| File Storage | Cloudflare R2 (S3-compatible) |
| Hosting | Vercel. Edge functions for auth middleware. |
| API | tRPC for internal type-safe calls. REST for external integration APIs. |

## **Critical Architecture Rules**

These are non-negotiable. If you are about to write code that violates any of these, stop and reconsider.

- NEVER store OAuth tokens in plaintext. Always use lib/encryption.ts AES-256-GCM encrypt/decrypt.
- NEVER hardcode model names outside lib/ai/providers/. getProvider() is the only function that knows model IDs.
- NEVER let tool failures crash a conversation. Every tool.execute() is wrapped in try/catch. Return error object.
- NEVER trust checkout success redirect for subscription activation. Wait for webhook.
- NEVER expose billingProvider (STRIPE/PAYSTACK/FLUTTERWAVE) to the client. Frontend sees tier + status only.
- NEVER set Jira status directly. Use the transitions API — fetch available transitions, find match, execute.
- NEVER use plain text or markdown in Jira description/comment fields. Always use ADF format.
- NEVER process GitHub or Google Calendar webhooks synchronously. Return 200 immediately, dispatch to Inngest.
- ALWAYS use single source of truth: PLANS constant in lib/billing/plans.ts. No plan logic hardcoded elsewhere.
- ALWAYS check installationId on GitHub integration before making API calls. It may not be set yet.
- ALWAYS use Atlassian API base: https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3/ — not atlassian.net.
- ALWAYS use StatusCategory for AI task status operations — never use status name strings directly.

## **Database — Key Tables**

Eight tables are most frequently referenced in code:

- User — id, clerkId (unique), email, planTier (FREE/PRO/TEAM/SMB). Synced from Clerk via webhook.
- Workspace — id, name, slug, ownerId, planTier, settings (JSON includes aiInstructions).
- Task — id, title, statusId (FK to WorkflowStatus), priority, source (KHOVE/GITHUB/JIRA/AI), externalId, userId, workspaceId.
- TaskAssignee — taskId, userId, role (OWNER/ASSIGNEE/REVIEWER/OBSERVER). Junction table. Never a single assigneeId on Task.
- WorkflowStatus — id, name, color, category (StatusCategory enum), workspaceId (null=global default). AI uses category, never name.
- Integration — id, provider, userId/workspaceId, accessTokenEnc (encrypted), refreshTokenEnc (encrypted), metadata (JSON with cloudId, installationId etc).
- Conversation — id, userId, workspaceId, messages (JSON array), summary. Pruned at 40 messages.
- Subscription — id, billingProvider, externalCustomerId, externalSubId, tier, status, currency.

## **AI System — How It Works**

Every AI call follows this exact 8-step sequence:

- Redis usage check — blocked if at plan limit. Returns 200 with blocked:true, not 4xx.
- Context assembly — conversation history + user memory summary + workspace settings.
- Complexity scoring — 0–2 = Flash, 3–6 = Haiku, 7+ = Sonnet. Free tier always Flash.
- Tool loading — tools loaded per tier and connected integrations. Free tier: task tools only.
- AI provider call — system prompt + messages + tools sent to correct model.
- Tool execution loop — AI calls tools, results returned, loop repeats max 5 times.
- Response returned — final text response to client.
- Post-processing — usage logged, memory updated (every 10 messages, paid tiers), conversation saved.

## **Billing — African Payment Strategy**

This is the most important business-specific technical decision in V1:

Rwanda — the Kigali beachhead — is NOT supported by Stripe. Nigeria, Ghana, Kenya, South Africa, Egypt are Stripe-supported. Rwanda, Uganda, Tanzania use Paystack or Flutterwave.

The solution: BillingProvider interface with three implementations (Stripe, Paystack, Flutterwave). Country detected from Vercel x-vercel-ip-country header. Correct provider selected silently. The frontend never knows which provider is active. The checkout flow returns a URL — user is redirected regardless of which processor generated it.

## **Design System — Visual Identity**

Dark mode first. Reference: Linear, Vercel, Resend, Raycast. NOT VS Code, NOT Jira, NOT Notion.

| Token | Value | Note |
| --- | --- | --- |
| Base surface | #09090B | Warm near-black — Vercel/Shadcn canonical dark |
| Card surface | #111113 | Primary card background |
| Elevated | #18181B | Modals, dropdowns |
| Brand primary | #6366F1 | Indigo — all primary actions |
| Brand secondary | #8B5CF6 | Violet — gradients and accents |
| Success / Done | #10B981 | Emerald |
| Warning / At-risk | #F59E0B | Amber |
| Error / Blocked | #F43F5E | Rose |
| Primary font | Geist sans | Vercel's font. Fallback: Inter Variable |
| Display font | Cal Sans | Warmth + personality. Fallback: Geist |
| Mono font | Geist Mono | IDs, code, ticket keys. Fallback: Fira Code |
| Primary easing | cubic-bezier(0.16,1,0.3,1) | The Linear/Raycast easing — everything feels snappy |

## **File Structure — Lib Directory**

lib/

auth.ts                 getCurrentUser(), requireUser()

db.ts                   Prisma client singleton

redis.ts                Upstash client, AIUsage helpers, PLAN_LIMITS

encryption.ts           encrypt(), decrypt() — AES-256-GCM

inngest.ts              Inngest client

ai/

index.ts              runAIConversation() — main orchestrator

router.ts             scoreComplexity(), routeToModel()

context.ts            assembleSystemPrompt(), pruneConversationHistory()

memory.ts             getUserMemory(), updateUserMemory()

tools/

index.ts            getToolsForContext() — tier-based tool loading

task-tools.ts

calendar-tools.ts   (Phase 3)

github-tools.ts     (Phase 4)

jira-tools.ts       (Phase 5)

standup-tools.ts    (Phase 5 — combines all integrations)

providers/

base.ts             AIProvider interface

anthropic.ts        Claude Haiku + Sonnet

google.ts           Gemini 2.5 Flash

integrations/

google/client.ts      getCalendarClient() — auto-refresh

google/calendar.ts    Core calendar operations

google/webhooks.ts    Watch channel management

github/app.ts         githubApp singleton, getInstallationClient()

github/operations.ts  Core GitHub operations

jira/client.ts        jiraRequest() — auto-refresh

jira/operations.ts    Core Jira operations

jira/sprint-intelligence.ts  Health, retro, standup

billing/

index.ts              getBillingProvider() — country routing

plans.ts              PLANS constant — single source of truth

checkout.ts           createCheckoutSession()

providers/stripe.ts

providers/paystack.ts

providers/flutterwave.ts

enforcement.ts        checkAndIncrementUsage(), enforceFeatureAccess()

design-system/

tokens.ts             Full design token map

## **API Routes**

| Route | Purpose |
| --- | --- |
| POST /api/chat | Main AI conversation endpoint |
| GET /api/integrations/google/connect | Start Google Calendar OAuth |
| GET /api/integrations/google/callback | Google OAuth callback |
| POST /api/integrations/google/disconnect | Remove Google integration |
| GET /api/integrations/github/connect | Start GitHub OAuth |
| GET /api/integrations/github/callback | GitHub OAuth callback |
| GET /api/integrations/github/installed | GitHub App installation callback |
| POST /api/integrations/github/disconnect | Remove GitHub integration |
| GET /api/integrations/jira/connect | Start Atlassian OAuth |
| GET /api/integrations/jira/callback | Atlassian OAuth callback |
| POST /api/integrations/jira/disconnect | Remove Jira integration |
| POST /api/webhooks/clerk | Clerk user sync webhook |
| POST /api/webhooks/github | GitHub App events webhook |
| POST /api/webhooks/google/calendar | Google Calendar push notifications |
| POST /api/webhooks/jira | Jira webhook events |
| POST /api/webhooks/stripe | Stripe billing events |
| POST /api/webhooks/paystack | Paystack billing events |
| POST /api/billing/checkout | Create checkout session (provider-agnostic) |
| POST /api/billing/portal | Get billing portal URL |

*Feed this note to Claude Code at the start of every session. All architectural decisions are final unless explicitly revised.*
