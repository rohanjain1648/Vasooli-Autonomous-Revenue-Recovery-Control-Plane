# Vasooli — Autonomous Revenue Recovery Control Plane

Razorpay AI Buildathon 2026 — Track 3, AI Revenue Recovery.

> Every at-risk case is randomly split into **treatment** (the agent
> intervenes) and **holdout** (status quo). The headline metric is not
> gross ₹ recovered but **incremental ₹, with a confidence interval and a
> p-value** — the recovery-rate gap between the two groups. See
> [docs/adr/0001](docs/adr/0001-measure-incremental-not-gross.md) for why
> this is the whole point.

The LLM is strictly read-only (diagnosis + content generation proposals
only). A deterministic Thompson-sampling bandit picks the intervention. A
deterministic policy gate approves every action before anything executes.
Every decision lands in a hash-chained, tamper-evident audit ledger. The
whole system runs fully offline by default — no database, no network
calls, no credentials required to see it work end to end.

```
signal → diagnose (LLM, read-only) → plan (bandit, never the LLM)
       → POLICY GATE (deterministic) → execute → ledger
```

See [docs/architecture.md](docs/architecture.md) for the full diagram and
[PITCH.md](PITCH.md) for the demo script.

## Quick start

```bash
pnpm install
pnpm test          # 160+ tests, fully offline, no network calls
pnpm typecheck      # every package, strict TypeScript

pnpm demo           # seeded, deterministic, offline batch — see it work in <30s
```

Sample output from `pnpm demo` (re-running prints byte-identical numbers —
see `apps/engine/scripts/demo.ts` for how the whole batch is seeded):

```
── Money Wall ──────────────────────────────────────────────
Gross recovered:        ₹1,67,690
Incremental (95% CI):   ₹1,18,061 ± ₹94,045  (p=0.559)
Treatment recovery:     30.4%  (n=92)   ███████░░░░░░░░░░░░░░░░░
Holdout recovery:       9.5%  (n=21)   ██░░░░░░░░░░░░░░░░░░░░░░
Cases detected:         113
Cases recovered:        30

── Audit ledger ────────────────────────────────────────────
Entries: 731
Hash chain valid: ✓ yes — no tampering detected
```

## Run the live dashboard

```bash
pnpm dev:engine     # Fastify API + SSE on :4000, starts a live signal feed
pnpm dev:web        # Next.js dashboard on :3000
```

Open `http://localhost:3000` — Money Wall, Cases, Approvals inbox, Audit
log (with independent browser-side chain re-verification), and
Experiments, all updating live via Server-Sent Events. No polling
anywhere in the frontend.

## Render the Hinglish voice artifact

```bash
pnpm demo:voice     # renders playbooks/phone-ivr.yaml -> demo/audio/hinglish-ivr-recovery.wav
```

Offline TTS via Windows SAPI — no live telephony dependency, no paid API
call. See [ADR 0005](docs/adr/0005-offline-first-provider-abstraction.md).

## Environment

Everything works with **no environment variables set** — every external
dependency (LLM, Razorpay) falls back to a deterministic offline fake.
Copy `.env.example` to `.env` and drop in real credentials to flip a
provider to live with no code changes:

```bash
cp .env.example .env
```

| Variable | Effect |
|---|---|
| `GROQ_API_KEY` / `OPENAI_API_KEY` | Flips `@vasooli/llm` to a real model (Groq wins if both set) |
| `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` | Flips `@vasooli/razorpay` to the live test-mode client |
| `PORT` | `apps/engine`'s listen port (default 4000) |
| `NEXT_PUBLIC_ENGINE_URL` | `apps/web`'s API base URL (default `http://localhost:4000`) |

## Repo layout

```
apps/
├── engine/     Fastify: EngineState (in-memory), REST + SSE, live signal feed, demo scripts
└── web/         Next.js 15 dashboard — 6 pages, all real-time via SSE
packages/
├── core/         Domain types, RecoveryCase state machine, Zod schemas
├── stats/        Wilson, Newcombe, CUSUM, Thompson sampling, mSPRT — hand-rolled, no black box
├── ledger/       Hash-chained tamper-evident audit log
├── policy/       Deterministic YAML-playbook-aware rule engine
├── llm/          Provider abstraction: openai/groq | deterministic mock
├── razorpay/     Provider abstraction: live test-mode | deterministic fake
├── executor/     Durable step runner: retries + reverse-order compensation
├── simulator/    Seeded event generator with injectable degradation regimes
├── detector/     4 deterministic leakage detectors (no LLM in detection)
└── orchestrator/ orchestrateCase() — the capstone that wires everything above together
playbooks/       YAML intervention catalog (arms, templates, approval flags)
demo/            Seeded batch output (demo/output/) + rendered IVR audio (demo/audio/)
docs/            Design spec, architecture diagram, ADRs
```

## Documentation

- [docs/superpowers/specs/2026-08-21-vasooli-design.md](docs/superpowers/specs/2026-08-21-vasooli-design.md) — the original approved design spec
- [docs/architecture.md](docs/architecture.md) — as-built architecture + diagram
- [docs/adr/](docs/adr/README.md) — decisions and why, including where the build deviated from the original spec and why
- [PITCH.md](PITCH.md) — 5-minute demo script + anticipated Q&A

## Testing

TDD throughout — every fix and every package started with a failing test.
`pnpm test` runs 160+ tests across 13 packages/apps in a few seconds,
entirely offline: statistics checked against known reference values,
policy rules covered by golden-table PASS/BLOCK/DEFER/NEEDS_APPROVAL
scenarios, the ledger's tamper-evidence property itself under test, and an
end-to-end orchestration test covering every branch (holdout, PASS,
BLOCK, DEFER, NEEDS_APPROVAL) with a real ledger and policy engine.
