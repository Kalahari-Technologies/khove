**COST & BUILD ESTIMATE**

**Khove.io**

*Pilot vs. full-platform*

Kigali & Lagos  |  2026  |  Confidential

> **These are planning estimates, not quotes.** Figures are USD, approximate, and current as of
> 2026. Infra is usage-priced, so real bills move with traffic. LLM/agent-run cost is the dominant
> variable and is designed to be *passed through* as metered usage. The point of this doc is the
> **shape** of the cost — bootstrappable to demo vs. what "full platform" actually demands — not a
> precise number.

---

## 0. Headline

- **Pilot → demo/pitch is bootstrappable.** No new paid services beyond the stack Khove already
  runs; everything is serverless / usage-priced with real free tiers. The only variable cost is
  LLM/agent tokens — **tens of dollars a month at demo scale.** You do **not** need heavy resources
  upfront. The real cost is **engineering time (~4–6 focused weeks)**, not infrastructure.
- **Full platform gets expensive only at scale — and by design, that cost scales *with revenue*.**
  The cost centres (LLM/agent-runs, compliance, a small team) arrive *with paying customers*, not
  ahead of them. The one way to make it expensive prematurely is scope creep into becoming a
  code-writer (self-hosted models, sandboxes, big compute) — the orchestrator positioning is
  precisely what keeps it cheap.

---

## 1. Assumptions

| | Pilot / demo | Full platform (illustrative "at scale") |
| --- | --- | --- |
| Users | Founding team + a handful of design partners | ~500 free, ~250 Pro, a few dozen Team/SMB workspaces |
| Repos / Threads watched | A few repos, tens of PR events/day | Hundreds of active Threads, thousands of events/day |
| Agents | 1 (GitHub PR Shepherd), approval-gated | Several agent types, some autonomous |
| AI providers | Anthropic + Google **direct** (default terms + DPA) | Same + optional Bedrock/Vertex per enterprise deal |
| Memory | mem0 **self-hosted** on existing Supabase pgvector | Same, larger vector store + graph memory |

---

## 2. Pilot cost (to a live, demoable product)

### 2.1 Infrastructure (monthly)

Everything below is the stack Khove **already** runs — the pilot adds **zero new paid services**.

| Service | Role | Demo | Early (a few design partners) |
| --- | --- | --- | --- |
| Vercel | Hosting + serverless + cron | $0–20 (Hobby→Pro) | $20 |
| Supabase | Postgres **+ pgvector (mem0 store)** | $0–25 | $25 |
| Upstash Redis | SSE queue / action metering | $0–10 | ~$10 |
| Inngest | Agent runtime (durable steps, cron) | $0 (free tier) | $0–20 |
| Clerk | Auth | $0 (<10k MAU) | $0–25 |
| Resend | Email | $0–20 | $20 |
| **Infra subtotal** | | **~$0–75/mo** | **~$100–120/mo** |

No GPUs, no self-hosted models, no separate vector DB, no data platform.

### 2.2 AI / LLM & memory (the only variable)

| Item | Notes | Demo | Early |
| --- | --- | --- | --- |
| Chat + PR Shepherd inference | Haiku for most runs, Sonnet for hard scope-drift reasoning, Gemini Flash-lite free tier | $5–50/mo | $50–300/mo |
| mem0 **license** | Self-hosted OSS | **$0** | $0 |
| mem0 **embeddings** | Gemini `text-embedding-004` — fractions of a cent per memory | negligible | a few $/mo |
| mem0 **extraction** | 1 Gemini Flash-lite call per *batched* memory write | a few $/mo | $10–40/mo |

At early-customer scale this LLM/agent cost is the thing you **meter and pass through** as agent-runs
(PRD §14) — it scales with revenue, not ahead of it.

### 2.3 Engineering effort (the real cost)

One strong full-stack engineer (or the founder + Claude Code):

| Work | Effort |
| --- | --- |
| Fix GitHub sensor (webhook env bug) + finish App config | 2–4 days |
| Connectivity Thread models + assembly + minimal UI | 1–1.5 weeks |
| PR Shepherd agent + approval flow + evidence-backed output + audit | 1.5–2 weeks |
| mem0 wiring (self-host, `scopedMemory`, recall/remember in the loop) | 3–5 days |
| Minimal MCP server + auth + one external-client demo | ~1 week |
| **Pilot total** | **~4–6 focused weeks** |

### 2.4 Pilot bottom line

**~$50–150/month of services + ~a month of engineering** for a live, agent-driven, demoable
product — not a mock. Bootstrappable without outside capital.

---

## 3. Full-platform cost (at scale)

This is directional — the enterprise phase, not the pilot.

### 3.1 Infrastructure (monthly, at the "at scale" assumptions)

| Area | Range | Driver |
| --- | --- | --- |
| Vercel / compute | $50–300 | traffic, function invocations, cron |
| Supabase (Postgres + pgvector at volume) | $100–500 | rows, vector index size, connections |
| Upstash Redis | $50–200 | SSE fan-out + metering throughput |
| Inngest (agent concurrency) | $50–300 | number & concurrency of agent-runs |
| Clerk | $100–500+ | MAU tiers |
| Resend / email | $20–100 | volume |
| Observability / logging (e.g. Sentry, logs) | $50–300 | added at scale |
| **Infra subtotal** | **~$500–2,500/mo** | grows sub-linearly with revenue |

### 3.2 LLM / agent-runs

The largest and most variable line — **grows linearly with agent-runs, which is the billed unit.**
Order-of-magnitude: **$300–3,000+/mo** at the assumed scale, offset by metered revenue. Levers:
model routing (Flash/Haiku/Sonnet by complexity), batched memory writes, prompt caching (manual
caching works on both direct APIs and Bedrock), and per-plan agent-run caps.

### 3.3 Enterprise-readiness (one-time + ongoing, when chasing enterprise deals)

| Item | Rough cost | Notes |
| --- | --- | --- |
| SOC 2 Type II | ~$15k–60k first year | audit + tooling (e.g. Vanta/Drata) + eng time |
| Bedrock / Vertex enablement | eng time only | provider-swap behind `lib/ai/providers/`; no rearchitecture |
| VPC / private networking, KMS, per-tenant isolation hardening | eng time | only for enterprise-tier customers |
| DPA / legal / security questionnaires | legal + eng time | recurring per deal |
| ZDR arrangement with Anthropic | contractual | request when a deal requires it — not a build cost |

### 3.4 Team & runway

At platform scale the dominant cost is **people**, not machines: a small team (≈3–6 — eng, a
design/PM hand, GTM) is the real burn. Infra + LLM together typically stay a **minority** of total
spend until well past product-market fit.

---

## 4. What drives cost, and how to control it

| Cost driver | Control |
| --- | --- |
| LLM / agent-runs | Route by complexity; batch memory writes; prompt caching; per-plan agent-run caps; meter & pass through |
| mem0 extraction | Batch every ~10 turns (already designed); Gemini Flash-lite for extraction |
| Infra at scale | It's all usage-priced — cost tracks usage, which tracks revenue |
| Enterprise features | **Deferred** until a paying customer requires them (SOC2, Bedrock, VPC) — never pre-built |
| The expensive mistake | Becoming a **code-writer** (self-hosted models, sandboxes, GPU compute). The orchestrator positioning avoids this entirely. |

---

## 5. Verdict

- **Pilot:** bootstrappable. ~$50–150/mo + ~a month of engineering to a real demo. Ship it on
  Anthropic + Google direct; don't pre-build the multi-provider gateway or enterprise security.
- **Full platform:** heavier, but the weight lands **with revenue** — LLM/agent-runs are metered,
  infra is usage-priced, and enterprise-readiness is bought only when a deal pays for it.

*Khove.io  |  Cost & Build Estimate  |  Confidential  |  Kigali & Lagos 2026*
