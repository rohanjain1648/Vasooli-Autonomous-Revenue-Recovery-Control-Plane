# ADR 0007: Hand-rolled statistics, no black-box stats library

**Status:** Accepted

## Context

The headline metric's credibility depends entirely on the statistics
behind it being correct and explainable in a live Q&A. A dependency on an
opaque stats library ("we call `scipy.stats` / some npm package and trust
its output") would mean nobody on the team could answer a pointed
follow-up question about how the confidence interval or p-value was
actually computed, and would add a black box in exactly the place the
pitch's credibility rests on transparency.

## Decision

`@vasooli/stats` implements every statistical primitive from its
published formula, with tests checked against known reference values, and
zero runtime dependencies beyond `zod` (used elsewhere in the monorepo,
not by this package for computation):

- **Wilson score interval** (`wilson.ts`) — binomial proportion CI.
- **Newcombe interval** (`newcombe.ts`) — CI on the difference of two
  proportions, built from each arm's Wilson interval.
- **CUSUM** (`cusum.ts`) — two-sided change-point detection, used by the
  payment-degradation detector.
- **Thompson sampling** (`thompson.ts`) — Beta-posterior bandit arm
  selection via Marsaglia-Tsang gamma sampling, seeded with a
  hand-rolled mulberry32 PRNG for reproducibility.
- **mSPRT / always-valid p-values** (`msprt.ts`) — a normal-mixture
  sequential probability ratio test (Johari, Koomen, Pekelis & Walsh,
  2017) so the dashboard can be watched live during the pitch without
  the "peeking problem" invalidating the statistics.

## Consequences

- Every formula has a docstring citing its source, and every edge case
  (zero trials, zero variance, all-success/all-failure) has an explicit
  guard and a test — see the F1–F3 fixes in the commit history, all
  caught by writing the edge-case test first, TDD-style.
- No `npm audit` surface from a stats dependency, and no version-upgrade
  risk of a library silently changing its numerical behavior between
  releases.
- The cost is that these implementations do not have years of production
  hardening the way, say, `scipy` does — they are correct for the
  documented formulas and covered scenarios, not exhaustively
  battle-tested against every possible numerical edge case a general-
  purpose library would handle. For a demo whose numbers must be
  explainable line-by-line, that trade favors transparency over breadth.
