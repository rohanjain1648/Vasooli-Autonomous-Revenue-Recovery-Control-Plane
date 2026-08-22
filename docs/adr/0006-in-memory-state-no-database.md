# ADR 0006: In-memory engine state instead of Postgres + Redis

**Status:** Accepted (supersedes the original scaffold)

## Context

The original design spec (§4, §12) planned Postgres for durable state
(cases, steps, policy decisions, ledger, experiments) and Redis Streams
for the event bus, with `docker compose up` bringing up both for any
reviewer. Early scaffolding (`docker-compose.yml`, a stub `.env.example`)
reflected this plan. As implementation actually proceeded through Plans
2–5, every package was built and tested against in-memory structures
first (the `Ledger` class, `EngineState`'s `Map<caseId, CaseRecord>`,
per-category bandit posteriors as plain arrays) because that was the
fastest path to a fully offline, deterministic, TDD-able system — and by
the time the dashboard (`apps/engine`) needed a real backing store, the
in-memory version already satisfied every requirement the demo needs:
live SSE updates, a verifiable audit chain, filterable case queries, and
reproducible batch replay.

## Decision

`apps/engine` ships with **no external database or message broker**.
`EngineState` (`apps/engine/src/state.ts`) is the single source of truth
for the running process: the shared `Ledger`, per-category bandit `Arm[]`
posteriors, and a `Map` of every `CaseRecord`. The `docker-compose.yml`
and Postgres/Redis env vars from the original scaffold have been removed
rather than left in place unused and misleading.

## Consequences

- **A process restart resets the world** — same as the simulator and
  every fake provider. For a buildathon submission this is an accepted
  trade: the seeded `pnpm demo` script exists precisely so a reviewer
  gets an interesting, non-empty dataset in under a minute without
  needing persistent infrastructure running first.
- There is exactly one engine process; horizontal scaling or multi-
  instance consumer groups (the original Redis Streams plan) is out of
  scope for this submission. `apps/engine/src/signal-feed.ts`'s comment
  block notes this explicitly where it stands in for the planned
  ingest pipeline.
- If this were taken toward production, the natural next step is not "add
  Postgres" as a new concept but "swap `EngineState`'s in-memory
  structures for the same interface backed by Postgres tables and a
  Redis-backed `EngineEventBus`" — the shape of the code (a state object
  with clear read/write methods, an event bus with `publish`/`subscribe`)
  was written to make that swap contained rather than a rewrite.
- This ADR exists specifically so the deviation from the original design
  doc is visible and explained, not silently inconsistent with §4's
  architecture diagram.
