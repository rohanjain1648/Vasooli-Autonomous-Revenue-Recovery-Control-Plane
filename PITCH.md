# Vasooli — 5-Minute Pitch

Track 3: AI Revenue Recovery. Target runtime: 5 minutes, plus buffer for
Q&A. Times below are cumulative, not per-section durations.

## 0:00 – The one sentence

> "Every team here will show you money their agent recovered. We're the
> only one who can tell you how much of that money the agent actually
> caused."

Pause. That's the whole pitch in one line — everything after this just
proves it.

## 0:20 – The problem with gross ₹

Track 3 asks for "measured money recovered." Most entrants will detect a
failure, have an LLM write an email, send it, and report gross ₹
recovered. That number is unfalsifiable — some of those customers would
have retried their own card anyway. You cannot tell, from gross ₹ alone,
whether the agent helped, did nothing, or actively got in the way.

## 0:50 – The fix: a real counterfactual

> "So every at-risk case we detect gets randomly split: 80% treatment,
> where the agent acts, 20% holdout, where we do nothing. The gap between
> those two groups — that's the only number we call 'recovered by the
> agent.'"

Show the assignment is `sha256(caseId) mod 100` — deterministic,
replayable, and auditable by anyone: the same case id always lands in the
same group, with no server-side state needed to enforce it
([ADR 0001](docs/adr/0001-measure-incremental-not-gross.md)).

## 1:20 – Live demo: run the batch

```bash
pnpm demo
```

Narrate while it runs (~10s): "This is a seeded, fully offline batch —
four categories of revenue leakage, real Razorpay error codes, a
degraded-issuer regime injected into the payment stream." Point at the
terminal output as it lands:

- **Money Wall numbers**: gross vs. incremental vs. CI vs. p-value.
- **Per-category uplift**: treatment vs. holdout, broken out by payment
  failure / checkout abandonment / subscription failure / B2B receivables.
- **Audit chain: valid** — say out loud: "every one of those decisions is
  in a hash-chained ledger; if I edited any entry, that line would flip to
  TAMPERED and this demo doesn't get to happen."

## 2:20 – Open the dashboard, walk one case end to end

```bash
pnpm dev:engine   # terminal 1
pnpm dev:web      # terminal 2
```

Navigate: **Money Wall** (the headline number, live via SSE — no refresh
button anywhere in this app) → **Cases** (click into one) → the timeline:
detected → diagnosed (LLM's proposal, labeled read-only) → planned
(bandit picked this arm, not the LLM) → policy_evaluated (which rule fired
and why) → executing → recovered.

> "Notice the LLM's diagnosis is just a label on this timeline — it never
> shows up as an action. The bandit picks the arm. The policy gate is the
> only thing that can say yes."

## 3:20 – The approval inbox (the safety story)

Open **Approvals**. Pick a case sitting there because
`humanApprovalForHighRiskRule` fired (a discount or fee waiver).

> "This didn't go out on its own — a human has to click Approve. If I
> reject it instead, watch what happens" — click Reject, show the case
> flip to `stopped` on **Audit** in real time.

## 3:50 – Audit log — don't take our word for it

Open **Audit**. Point at the green banner: *"Hash chain verified
in-browser."*

> "That's not the server telling you it's fine — that's your browser
> re-hashing SHA-256 over every entry, right now, independently."

(Optional, if time: mention the `_tamperForTest` unit test that proves
`verify()` actually catches a mutated entry — it's not just implemented,
it's tested to fail loudly.)

## 4:20 – Experiments tab — the closed loop

Open **Experiments**. Point at one category's treatment-vs-holdout bars.

> "Every outcome feeds back into the bandit's posterior — the playbook
> that's working gets picked more often over time. This isn't a one-shot
> script; it's a system that gets better at recovering revenue the longer
> it runs."

## 4:40 – The Hinglish voice artifact (if asked, or if time remains)

```bash
pnpm demo:voice
```

Play `demo/audio/hinglish-ivr-recovery.wav`. Note honestly: rendered
offline via Windows SAPI (no live telephony, no paid TTS API — see
[ADR 0005](docs/adr/0005-offline-first-provider-abstraction.md)), so it's
an English voice reading romanized Hinglish — a template-and-render
pipeline demo, not a production voice claim.

## 4:55 – Close

> "Every number on this dashboard was produced by code you can read, with
> statistics you can re-derive by hand, on an audit trail you can
> re-verify yourself. That's what 'measured' should mean."

## Anticipated questions

**"How is this safe with real money?"**
The LLM never picks an action or moves money — see
[ADR 0002](docs/adr/0002-llm-read-only-deterministic-gate.md). Point at
the policy gate rule list and the approvals inbox.

**"Why not use scipy / a stats library?"**
[ADR 0007](docs/adr/0007-hand-rolled-statistics-no-black-box.md) — every
formula is cited and tested against known values; nothing is a black box
in a system whose entire pitch is "trust these numbers."

**"Does this need Postgres/Redis to run?"**
No — [ADR 0006](docs/adr/0006-in-memory-state-no-database.md). `pnpm demo`
runs the whole pipeline in-process with zero infrastructure.

**"What happens with a real LLM/Razorpay key?"**
Drop it in `.env` — [ADR 0005](docs/adr/0005-offline-first-provider-abstraction.md).
Same code path, same tests, live instead of fake.

**"What's out of scope?"**
Live outbound telephony, multi-tenant auth, real SMS/WhatsApp delivery —
all explicit, all in the design spec §13, none silently missing.
