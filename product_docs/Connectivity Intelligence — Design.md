# Khove — Connectivity Intelligence (Design)

> Status: **approved direction, phased build starting**. Written 2026-07-29.
> Owner-facing design doc for the delivery-intelligence layer and the
> provider-agnostic spine that lets every integration (GitHub, Jira, Azure DevOps,
> Linear, Notion, …) feed the same intelligence. Grounded against the live schema
> (`khove_backend/prisma/schema.prisma`) and the V4 direction in `CLAUDE.md`.

---

## 1. The problem we're actually solving

A PM/PD never opens Khove to read a diff. Connecting GitHub (or Jira, or anything)
serves exactly four jobs-to-be-done:

1. **Delivery confidence** — "Will the thing I promised land on the date I promised?"
2. **Bottleneck removal** — "What's stuck, and can I unblock it?" (a PM's real lever)
3. **Scope integrity** — "Is what's being built what we agreed to build?"
4. **Status synthesis** — "What do I tell leadership this week?"

GitHub is the only **ground truth** of engineering progress. Jira/roadmap is what
people *say*; GitHub is what *actually happened*. The whole value is holding both
and showing where they diverge. A list of open PRs answers none of the four — that's
why raw integration views feel like slop.

**Positioning (unchanged):** *companies have a context problem, not a
project-management problem.* Khove's edge is not "another eng-metrics dashboard"
(LinearB/Swarmia/Haystack do that for eng managers). It's tying flow metrics to
**product intent** through the Connectivity Thread, and surfacing **cross-platform
patterns** — how a signal in one tool predicts an outcome in another.

---

## 2. Scope model — what "connecting GitHub" binds to

**A workspace = one product/initiative surface.** People don't work at "a repo" or
"everything." A product spans a few repositories inside one org.

- **Install** the Khove app on the **org** (existing install flow, `installation_id`).
- **Select the repos** that make up *this workspace's* product. `Integration` is
  already `@@unique([provider, workspaceId])`, so each workspace selects a different
  subset of the same org install. **That selection is the product boundary.**
- Never "sync everything." A 200-repo org firehosed into one PM view is noise and
  makes every metric meaningless.

Generalized: the scope's *shape* is provider-specific but the *concept* is identical.

| Provider | Scope unit | Stored in `Integration.metadata.scope` |
|---|---|---|
| GitHub | repositories | `{ repos: ["org/web", "org/api"] }` |
| Jira | projects | `{ projects: ["ENG", "DESIGN"] }` |
| Azure DevOps | project + repos | `{ project, repos: [...] }` |
| Linear | teams | `{ teams: [...] }` |
| Notion | databases | `{ databases: [...] }` |

**Scope is step zero.** Metrics computed over an undefined scope are worthless.

---

## 3. The spine — a provider-agnostic data model

Three layers. The intelligence is written **once**, over the normalized layer, so
every new integration lights up the same charts by emitting the same shapes.

### 3.1 `Signal` — the append-only event store (NEW)

Every integration emits *events over time*. We normalize them into one table. This
is the time-series foundation that today we throw away (we only snapshot open items).

```prisma
model Signal {
  id          String   @id @default(cuid())
  workspaceId String
  provider    IntegrationProvider
  kind        SignalKind
  entityType  String   // "pull_request" | "issue" | "jira_issue" | "work_item"
  entityKey   String   // stable: "github-pr-org/web-123" | "jira-ENG-45"
  source      String?  // repo full_name / project key (the scope unit)
  actorKey    String?  // normalized person key (login/email/accountId)
  occurredAt  DateTime // when it HAPPENED (from the payload, not ingest time)
  metadata    Json     @default("{}")
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, provider, kind, entityKey, occurredAt]) // idempotent ingest
  @@index([workspaceId, provider, occurredAt])
  @@index([workspaceId, entityKey])
}

enum SignalKind {
  WORK_OPENED        // PR/issue/ticket created
  WORK_MERGED        // PR merged (the "done for real" signal)
  WORK_CLOSED        // closed without merge / cancelled
  WORK_REOPENED
  REVIEW_REQUESTED
  REVIEW_SUBMITTED   // approved / changes_requested / commented
  STATUS_CHANGED     // workflow/board transition (Jira, PR draft↔ready)
  CI_COMPLETED       // success/failure
  DEPLOY             // merge-to-default or explicit deploy
  COMMENT
  MEETING_HELD       // calendar
  DECISION           // captured decision (future: meeting notes)
}
```

- **Idempotent**: the unique key means replaying a webhook or a backfill never
  double-counts.
- **`occurredAt` is the payload timestamp** — critical: metrics are about when work
  *happened*, not when we ingested it.
- `Task` stays the **current-state projection** (already has `source[]`, `metadata`);
  `Signal` is the **history**. No new "work item" model needed — Task is it.

### 3.2 Initiative — the Connectivity Thread, given a spine (EXTEND `Thread`)

The Thread already links meeting ↔ tickets ↔ PRs ↔ people across platforms — it *is*
the initiative. It only lacks a target and a health. Extend it:

```prisma
// added to model Thread:
startedAt   DateTime?
targetDate  DateTime?   // the promise; a Thread with a targetDate IS an initiative
health      String?     // ON_TRACK | AT_RISK | SLIPPING (computed, cached)
```

An **Initiative** = a Thread with a `targetDate`. Its scope = the work items linked
via `ThreadLink`. This keeps the Thread as THE spine rather than inventing a parallel
concept.

### 3.3 `MetricSnapshot` — daily rollups (NEW, Phase 3 optimization)

Folding all Signals per request is fine at pilot scale but won't hold. A nightly cron
writes daily rollups (throughput, cycle-time p50/p90, WIP, per initiative + per
workspace); charts read snapshots, the live header folds the last few days of Signals.

```prisma
model MetricSnapshot {
  id          String   @id @default(cuid())
  workspaceId String
  scope       String   // "workspace" | "initiative:<threadId>" | "repo:<full_name>"
  day         DateTime // date bucket (UTC midnight)
  metrics     Json     // { merged, opened, wip, cycleP50, cycleP90, reviewLatencyP50, ... }
  @@unique([workspaceId, scope, day])
  @@index([workspaceId, scope, day])
}
```

---

## 4. Provider adapter contract — how every platform plugs in

The intelligence layer never learns a provider's API shape. Each integration
implements one contract; everything downstream is provider-agnostic.

```ts
interface ProviderAdapter {
  provider: IntegrationProvider;
  scopeType: "repos" | "projects" | "teams" | "databases";

  // Scope picker: what can this workspace choose from?
  listScopeCandidates(workspaceId): Promise<ScopeOption[]>;

  // Historical events on connect / re-sync, so charts aren't empty on day one.
  backfill(workspaceId, scope, since: Date): Promise<Signal[]>;

  // Live webhook → normalized Signals (+ current-state Task upsert).
  ingestWebhook(workspaceId, payload): Promise<Signal[]>;
}
```

- GitHub, Jira, Azure, Linear, Notion each implement `ProviderAdapter`.
- Metrics + insights read `Signal` + `Thread`, so **a new adapter = new charts for
  free.**
- `lib/integrations/github.ts` and `lib/integrations/jira.ts` become adapters; the
  normalize/backfill logic moves behind the contract.

---

## 5. Metric definitions (precise, DORA-anchored)

Computed by folding `Signal`s over a window; all are provider-agnostic.

| Metric | Definition (over Signals) | Job |
|---|---|---|
| **Lead time for changes** (DORA) | `WORK_OPENED → WORK_MERGED` per item; report p50/p90 | 1,2 |
| **Review latency** | `REVIEW_REQUESTED → first REVIEW_SUBMITTED` | 2 |
| **Cycle time** | open → merge (proxy for lead time when no first-commit signal) | 1,2 |
| **Throughput / velocity** | count `WORK_MERGED` per week (rolling avg) | 1,3 |
| **Deployment frequency** (DORA proxy) | `DEPLOY` (merge-to-default) per week | 3 |
| **Change-failure rate** (DORA proxy) | share of merges followed by revert/hotfix ≤ N days (label/title heuristic) | 3 |
| **WIP & aging** | open items + time-in-current-state (latest `STATUS_CHANGED`) | 2 |
| **Burn-up to date** | initiative: cumulative done vs total scope over time; projected finish = remaining ÷ recent velocity, compared to `targetDate` | 1,4 |
| **Scope integrity** | merged work with no Thread link (unplanned); Thread tickets "Done" with no merged PR (fiction) | 3 |

---

## 6. Cross-platform connectivity — the moat mechanics

The reason this isn't "another metrics dashboard": with `Signal` + `Thread` we compute
facts **no single-tool product can**, because they span sources.

- **Delivery prediction.** Initiative (Thread + `targetDate`) → sum linked work →
  merge velocity from Signals → *"Checkout lands Aug 22, 7 days late; the blocker is
  PR #123, blocked in review 4 days."* (Observe → Predict → Recommend → Act,
  evidence-backed.)
- **Scope integrity.** `github WORK_MERGED` whose `entityKey` is in no Thread →
  unplanned work. `jira STATUS_CHANGED→Done` with no merged PR in the same Thread →
  claimed-done fiction. *Context problem, made visible.*
- **Correlators.** Cross-provider pattern detection: *"review latency +40% in weeks
  with 3+ meetings/day"* (calendar Signals × GitHub cycle-time). *"Tickets that skip
  design review ship 2× the bugs."* This is "patterns from each part affect the other."
- **Auto status report.** "This week in Checkout": merged PRs + closed tickets +
  meeting decisions, one evidence-linked paragraph — the weekly-update job every PM
  hates.

The **Insight Engine** = a set of cross-provider correlators reading `Signal` + the
Thread graph, emitting the existing evidence-backed `Insight {signal, confidence,
sources}` shape (from calendar intelligence) and `AgentAction`s for the actionable
ones. **Governance unchanged**: read auto / write approval / delete explicit, audited.

---

## 7. Visualizations → jobs (what earns "YC-level")

| Surface | Serves |
|---|---|
| **Initiative burn-up to target + slip projection** | 1, 4 |
| **Cycle-time / lead-time trend + distribution** (DORA) | 1, 2 |
| **Aging WIP** (bars by days-in-state) | 2 |
| **Throughput / velocity** (merges/week rolling) + **DORA-lite scorecard** | 1, 3 |
| **Review-latency & reviewer-load over time** (bus-factor) | 2 |
| **Connectivity-Thread Gantt** (meeting → ticket → PR → merge → ship, cross-platform) | 1, 3 |
| **Scope-integrity panel** (unplanned merges; done-without-code) | 3 |
| **Auto weekly status report** | 4 |

The "Gantt" is a **cross-platform delivery timeline**, not a code chart.

---

## 8. Phased build

**Order matters: build the spine before the charts — every chart is a fake without
history.**

- **Phase 1 — Spine (data foundation).** `Signal` model + `SignalKind` (migration);
  a provider-agnostic `recordSignals()` helper; GitHub webhook handler emits Signals
  (WORK_OPENED/MERGED/CLOSED, REVIEW_SUBMITTED, CI_COMPLETED); **backfill** merged PRs
  (last 90d) on connect/re-sync; **repo-scope picker** (list installation repos → save
  `metadata.scope.repos`; sync/metrics honor scope). *No charts yet — data starts
  accumulating.*
- **Phase 2 — Initiative burn-up + slip prediction.** `Thread.targetDate/startedAt`;
  initiative view with burn-up + projected finish vs target; delivery-risk `Insight` +
  `AgentAction`. *The killer end-to-end slice (jobs 1 & 4, cross-platform moat).*
- **Phase 3 — Flow metrics.** Cycle-time, throughput, aging WIP, DORA-lite on the
  GitHub dashboard; `MetricSnapshot` cron.
- **Phase 4 — Connectivity intelligence.** Cross-platform correlators, scope-integrity
  panel, auto weekly status report.
- **Phase 5 — Fan out.** Jira adapter emits Signals → same charts light up. Then Azure
  DevOps, Linear, Notion adapters against the same contract.

---

## 9. Have vs. need

**Have:** `Task` (normalized current state), `Thread`/`ThreadLink` (cross-platform
graph), `AgentAction`/`AuditLog` (governed actions), `Insight` shape, provider webhooks
(GitHub/Jira/Calendar), install-scoped GitHub client, per-workspace `Integration`.

**Need (new):** `Signal` event store + `SignalKind`; backfill jobs; `metadata.scope`
+ scope-picker UI; `Thread.targetDate/startedAt/health`; metric compute lib +
`MetricSnapshot` cron; chart components; the `ProviderAdapter` refactor so GitHub/Jira
become adapters.

**Non-negotiables carried in:** never store tokens plaintext; webhooks 200→Inngest,
never sync; `PLANS` gates features; agent **writes = approval, audited**; everything
**workspace-scoped**; model IDs only in `lib/ai/providers/`.

---

## 10. Data richness — why "only issues/PRs", and the context graph

**The ceiling (honest):** the first cut modeled *work items* (`Task`) + *events*
(`Signal`). PRs, issues, and Jira tickets fit the Task shape, so they got ingested —
but **repositories, projects, sprints, epics, releases, components, people/teams**
are *containers and context*, not tasks. With no home for them, they were dropped.
That's why dashboards could only count issues/PRs and the AI could only answer "how
many". For a PM, the structure (sprint, epic, release, velocity-in-points) *is* the
product.

### 10.1 First hardening (shipped): rich work-item context
Without any new model, the sync now enriches `Task.metadata` with the *content*
context that lives on each work item — no personal data:
- **Jira:** priority, labels, components, fixVersions (releases), story points,
  **sprint** (name/state/dates/goal), **epic** (parent). Custom-field ids (Sprint /
  Story Points / Epic Link) vary per site, so `discoverJiraFields` resolves + caches
  them. **Sprint intelligence** (committed vs done points/issues, days remaining) is
  grouped from this metadata — no Agile API / extra OAuth scopes needed.
- **GitHub (already):** review decision, CI status, requested reviewers, labels,
  head SHA, draft state.

### 10.2 The context graph (next): first-class containers — `Entity`
The structural layer the metadata approach can't fully express (a sprint as an object
with a burndown, an epic with child progress, a release with a date, a repo as a
product surface). A single provider-agnostic model:

```prisma
enum EntityKind { REPOSITORY PROJECT SPRINT EPIC RELEASE MILESTONE COMPONENT BOARD LABEL PERSON TEAM }
model Entity {
  id, workspaceId, provider, kind, externalId, key, name, url, status,
  parentExternalId?,   // hierarchy: story→epic, sprint→board, epic→project
  metadata (json),     // dates, goal, points target, released?, language, ...
  @@unique([workspaceId, provider, externalId])
}
```

- **GitHub entities:** repositories (language/topics/README), releases + tags,
  milestones, branches, workflows/deployments, CODEOWNERS/teams.
- **Jira entities:** projects, sprints, epics, versions (releases), components, boards.
- **Tasks reference entities** (a PR belongs to a repo; an issue belongs to a
  project + sprint + epic) → epic progress, release readiness, sprint burndown,
  component churn, and cross-tool chains (epic ↔ PRs ↔ meeting ↔ release).
- **People/teams** (opt-in, since it's personal data) unlock load/bus-factor across
  review load (GitHub) + assigned issues (Jira) + meetings (Calendar).

### 10.3 Order
1. ✅ Rich work-item metadata + Jira sprint intelligence.
2. GitHub rich context (releases/milestones + repo-as-entity map).
3. The `Entity` model → epic progress + release readiness + sprint burndown charts.
4. Cross-tool chains over the entity graph (epic → PRs → release), then opt-in people.
