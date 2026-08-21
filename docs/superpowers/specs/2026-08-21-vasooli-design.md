# Vasooli — Autonomous Revenue Recovery Control Plane

**Status:** Approved for implementation
**Track:** Razorpay AI Buildathon 2026 — Track 3, AI Revenue Recovery
**Deadline:** 2026-09-05 (application deadline)
**Date:** 2026-08-21

## 1. Problem & thesis

Track 3's brief asks for an agent that detects revenue at risk, determines the
right intervention, and executes a bounded recovery workflow — across payment
failures, checkout abandonment, failed subscriptions, and overdue
receivables. The explicit bar: *"Don't just identify the problem. Show
measured money recovered across a batch, with compliant escalation, stopping
rules, and an audit trail."*

The word doing the work is **measured**. Recovered revenue cannot be measured
without a counterfactual — what would have happened without the agent. Most
entrants will build a detector + LLM-written-outreach pipeline and report
gross ₹ "recovered," which is unfalsifiable (some of that money would have
come back anyway).

**Core thesis:** every at-risk case is randomly assigned to **treatment**
(agent intervenes) or **holdout** (status quo, no intervention). The
headline metric is not gross ₹ but **incremental ₹ with a confidence
interval**, e.g.:

> ₹4.2L gross · **₹2.9L incremental (95% CI ±₹31k, p = 0.003)** · ₹2.71L net
> after intervention cost

This one metric is the differentiator and the anchor of the pitch. Everything
else in the system exists to produce that number safely, explainably, and
verifiably.

## 2. Non-negotiable invariant

**The LLM is read-only.** It may propose a diagnosis and propose a playbook.
It never moves money, never picks the final action, and never bypasses a
policy check. The path from signal to executed action is:

```
signal → LLM diagnosis (proposal) → bandit (arm selection) → POLICY GATE (deterministic) → executor
```

Every step the LLM's output touches is Zod-validated structured output, not
free text parsed downstream. This is the one-sentence answer to "how is this
safe with real money," which the panel will ask.

## 3. Scope

All four revenue-leakage categories named in the brief, sharing one pipeline
(detect → diagnose → plan → policy → execute → measure):

1. Payment failure / degradation
2. Checkout abandonment
3. Failed subscription / mandate retry
4. B2B overdue receivables (promise-to-pay tracker)

Plus a Hinglish voice recovery script + TTS render (offline-safe: generated
audio file, no live telephony dependency).

## 4. Architecture

```
                    ┌─────────────── Redis Streams (durable, replayable, consumer groups)
Razorpay webhooks ──┤
Event simulator   ──┘   revenue.events → risk.signals → case.actions → outcomes
                              │             │              │            │
                          ┌───▼───┐   ┌─────▼─────┐  ┌─────▼────┐ ┌─────▼──────┐
                          │ingest │   │ detector  │  │ executor │ │measurement │
                          └───────┘   └───────────┘  └──────────┘ └────────────┘
                                            │              ▲            │
                                      ┌─────▼──────────────┴────────────▼─────┐
                                      │          orchestrator (agent)          │
                                      │  diagnose → plan → POLICY GATE → exec  │
                                      └────────────────────────────────────────┘
                                                        │
                    Postgres: cases · steps · policy_decisions · LEDGER · experiments
                                                        │
                                          Fastify REST + SSE → Next.js dashboard
```

### Repo layout

```
vasooli/
├── apps/
│   ├── web/            Next.js 15 dashboard, SSE live updates
│   └── engine/         Fastify service: ingest, detector, orchestrator,
│                        executor, measurement, REST + SSE API
├── packages/
│   ├── core/            Domain types, RecoveryCase state machine, Zod schemas
│   ├── stats/           wilson, newcombe, cusum, thompson, mSPRT — hand-rolled,
│   │                     TDD'd, no black-box stats library
│   ├── policy/           YAML guardrail DSL + evaluator
│   ├── ledger/           Hash-chained tamper-evident audit log
│   ├── llm/              Provider abstraction (openai | groq | mock), tool
│   │                     loop, RAG retrieval
│   ├── razorpay/         Live test-mode client and a faithful in-memory fake
│   │                     behind the same interface — swap via env var
│   └── simulator/        Event firehose with injectable degradation regimes
├── playbooks/           YAML intervention catalog
├── knowledge/           RAG corpus: failure taxonomy, RBI/TRAI rules,
│                        Razorpay error semantics
└── docs/                design doc, ADRs, PITCH.md
```

Stack: all-TypeScript pnpm monorepo. Postgres for durable state (cases,
steps, policy decisions, ledger, experiments). Redis Streams for the event
bus (consumer groups, replay-from-offset, backpressure). `docker-compose up`
brings up both for any reviewer.

## 5. Detection — deterministic, not LLM

One shared pipeline, four detectors:

| Detector | Signal |
|---|---|
| Payment degradation | Rolling success rate per cohort (issuer × method × network × BIN band); CUSUM change-point detection + Wilson-interval drop vs. 7-day baseline |
| Checkout abandonment | `order.created` with no `payment.captured` past a TTL |
| Subscription / mandate | Failed `subscription.charged`, missed mandate debit dates, `payment_frequency_limit_exceeded` |
| B2B receivables | Invoice aging buckets, DSO drift, promise-to-pay breach |

Real Razorpay error codes are used throughout (`GATEWAY_ERROR`,
`issuer_down`, `insufficient_funds`, `card_expired`, `authentication_failed`,
`limit_exceeded`). Every signal carries a ₹ exposure amount so downstream
policy and measurement can reason economically. All money is `paise: bigint`,
never floating point.

## 6. The agent loop

1. **Diagnose (LLM + RAG).** Read-only tools: `get_cohort_stats`,
   `get_baseline_comparison`, `get_entity_history`, `get_customer_profile`,
   `search_knowledge`. Output is Zod-validated JSON: root cause, confidence,
   cited evidence (e.g. "HDFC credit on Visa fell 71%→22% at 14:07 —
   issuer-side, not your integration").
2. **Plan (bandit, not LLM).** Thompson sampling over `Beta(α, β)` posteriors
   per `(segment, playbook)` selects the arm. The LLM never picks the
   playbook — it only generates the content (email copy, Hinglish script)
   for the arm the bandit already chose. Model routing: Groq for
   high-volume fast generation, OpenAI for diagnosis reasoning and TTS.
3. **Policy gate (deterministic YAML, evaluated before every action).**
   Example rules: TRAI DND quiet hours (21:00–09:00, defer), economic
   viability (`expected_value_paise > 0` — never spend ₹40 chasing ₹25),
   cost-ratio cap, max touches per case, cool-off between touches, hard
   stopping rules (customer opts out, dispute opened, refund issued, already
   recovered — terminal), and human-approval-required for discounts or
   large amounts. Every rule emits `PASS | BLOCK | DEFER | NEEDS_APPROVAL`
   with a reason string, persisted to `policy_decisions`.
4. **Execute.** Durable step runner with retries, timeouts, compensations,
   and idempotency keys. Real Razorpay test-mode Payment Links; email/SMS/
   WhatsApp adapters (mocked, logging-based); smart-timed retry scheduling;
   Hinglish voice script + TTS audio render; promise-to-pay capture for B2B.

## 7. Measurement — the differentiator

- **Assignment:** `sha256(case_id ‖ experiment_salt)` mod 100 → stable,
  deterministic, replayable, auditable. Default holdout 20%, configurable
  per experiment.
- **Uplift:** Wilson score intervals per arm; Newcombe interval on the
  difference between treatment and holdout recovery rates.
- **Incremental ₹:** `(p_treatment − p_holdout) × n_treatment ×
  mean_recovered_amount`, with the CI propagated through.
- **Always-valid sequential testing (mSPRT / e-values)** so the dashboard can
  be watched live during the pitch without invalidating the statistics —
  no "peeking problem."
- **Recovery P&L:** `net = incremental − Σ action_cost − Σ discounts_granted`.
- Outcomes feed back into the bandit's posteriors — closed loop from
  measurement to future arm selection.

## 8. Audit ledger

Append-only, hash-chained: `hash_n = sha256(hash_{n-1} ‖
canonical_json(entry))`. Each entry records actor, case id, action, model
name + prompt hash, a reasoning summary, every policy verdict on the path,
every tool call, and ₹ impact. `GET /audit/verify` recomputes the chain live
on stage against stored entries — tamper-evident, not just "we logged it
somewhere." Supports per-case replay and NDJSON export.

## 9. Dashboard

- **Money Wall:** ₹ at risk, gross recovered, **incremental (±CI, p-value)**,
  net P&L, treatment vs. holdout recovery rate — live via SSE.
- **Live incident feed** with root cause summaries.
- **Glass-box case view** (the demo's money shot): signal → diagnosis with
  cited evidence → policy checks lighting green/red in sequence → chosen
  playbook and why → executed steps → ₹ outcome, streaming as it happens.
- **HITL approval inbox** for policy-gated actions needing human sign-off.
- **Experiments tab:** uplift per playbook, live bandit posteriors.
- **Audit tab** with a one-click chain-verify button.
- **Global kill switch** — stops all outbound actions instantly.

## 10. Testing strategy (TDD throughout)

- `stats`: Wilson/Newcombe intervals checked against published reference
  tables; CUSUM validated on synthetic step-change series.
- `policy`: golden-table scenarios → expected verdicts (every rule gets at
  least one PASS and one BLOCK/DEFER case).
- `ledger`: tamper test — mutate a stored entry, assert `verify()` fails.
- `core`: state machine rejects invalid transitions.
- End-to-end: seeded simulator run of 500 events → assert incremental ₹ > 0
  **and** the audit chain verifies clean.

## 11. Provider abstraction & offline-first operation

Everything that touches an external paid service (LLM, Razorpay, SMS/voice)
sits behind an interface with two implementations: a live adapter and a
deterministic fake. The system runs fully offline out of the box (mock LLM
producing structurally valid, seeded outputs; in-memory Razorpay fake with
realistic responses and latency). Dropping `OPENAI_API_KEY` / `GROQ_API_KEY`
/ `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` into `.env` flips the
corresponding adapter to live with no code changes. This is required because
credentials may not be available for the whole build window and the demo
must never depend on live network calls succeeding on stage.

## 12. Delivery plan (15 days to 2026-09-05)

| Days | Deliverable |
|---|---|
| 1–2 | Monorepo scaffold, docker-compose (Postgres + Redis), DB schema, `core` state machine, ledger + tamper test |
| 3–4 | Simulator with injectable degradation regimes, ingest service, Redis Streams wiring, four detectors |
| 5–6 | `stats` package (fully TDD'd), experiment assignment, measurement engine |
| 7–8 | Policy DSL + evaluator + golden-table tests; playbook YAML catalog |
| 9–10 | LLM provider abstraction, RAG, diagnosis agent, bandit planner, executor, Razorpay adapter (live + fake) |
| 11–12 | Dashboard: money wall, glass-box case view, approvals inbox, audit tab |
| 13 | Hinglish voice script + TTS render; seeded `pnpm demo` batch script |
| 14 | README, architecture diagram, ADRs, PITCH.md; commit history cleanup |
| 15 | Buffer; rehearse the 5-minute pitch and architecture walkthrough |

## 13. Out of scope (explicitly, to prevent scope creep)

- Live outbound telephony (voice is script + TTS render only).
- Multi-tenant auth/RBAC beyond a single demo org.
- Real SMS/WhatsApp delivery (adapters log realistic payloads instead of
  calling a paid provider, unless credentials are supplied later).
- Any float-based money arithmetic — paise integers only, everywhere.
