# ADR 0001: Measure incremental recovery, not gross

**Status:** Accepted

## Context

Track 3's brief asks for "measured money recovered," and every entrant will
be tempted to report gross ₹ recovered — the sum of `recoveredPaise` across
every case the agent touched. Gross recovery is unfalsifiable: some fraction
of that money would have come back with no intervention at all (a customer
retries their own failed card, a subscription mandate succeeds on its own
next attempt). Reporting it as "recovered by the agent" overstates impact
and cannot be disproven or reproduced by a judge.

## Decision

Every detected case is randomly assigned to **treatment** (the agent
intervenes) or **holdout** (status quo, no intervention), via
`sha256(caseId) mod 100` compared to a configurable holdout percentage
(`packages/orchestrator/src/assignment.ts`). The headline metric is the
**recovery-rate gap between the two cohorts**, converted to ₹ and reported
with a confidence interval and a p-value:

```
incremental ≈ (p_treatment − p_holdout) × n_treatment × mean_exposure
```

computed via `@vasooli/stats`'s Newcombe interval (rate-difference CI) and
mSPRT (always-valid sequential p-value) — see
[0007](0007-hand-rolled-statistics-no-black-box.md). The dashboard's Money
Wall (`apps/web/src/app/dashboard/page.tsx`) leads with this number, not
gross.

## Consequences

- Every case must carry an `armGroup: "treatment" | "holdout"` field for
  its entire lifecycle (`packages/core/src/types.ts`).
- Holdout cases still need a simulated/observed outcome to compare against
  — in the offline demo this is `simulatedOutcome()`
  (`packages/orchestrator/src/outcome.ts`), deterministically derived from
  the case id so a batch replay reproduces the same split.
- A 20% default holdout means roughly a fifth of at-risk revenue is
  deliberately left unaddressed during the demo window — the cost of
  having a real counterfactual instead of a marketing number.
- Because assignment is a pure hash of `caseId`, it is stable across
  retries and process restarts with no shared state required, and it is
  independently auditable by anyone re-hashing the case id.
