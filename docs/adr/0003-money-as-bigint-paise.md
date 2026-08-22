# ADR 0003: Money is always `bigint` paise, never a float

**Status:** Accepted

## Context

Floating-point arithmetic on currency amounts is a well-known source of
silent, compounding errors (`0.1 + 0.2 !== 0.3`), and this system does a
lot of currency arithmetic: summing exposure across hundreds of cases,
computing cohort averages for the money-wall extrapolation, comparing
action cost against recoverable amount in the policy gate's economic-
viability rule. Any float drift here directly corrupts the one number
(incremental ₹) the whole pitch is built on.

## Decision

Every money field, everywhere in the system, is `bigint` paise (1 rupee =
100 paise) — never `number`, never a decimal string used for arithmetic.
`packages/core/src/types.ts` defines `MoneyPaise = z.bigint().nonnegative()`
and every schema that carries an amount (`RiskSignal.exposurePaise`,
`RecoveryCase.exposurePaise` / `recoveredPaise`) uses it.

JSON has no `bigint` type, so a boundary codec exists specifically for
serialization: `MoneyPaiseJson` (a Zod union accepting string/number/bigint
input, always producing bigint) plus `paiseToJson()` / `stringToPaise()`
helpers. `apps/engine/src/serialize.ts`'s `toJsonSafe()` recursively
stringifies every bigint before an HTTP response or SSE payload is sent,
since `JSON.stringify` throws on a raw bigint.

## Consequences

- Any arithmetic mixing `bigint` and `number` is a `TypeError` at the type
  level (`tsc` catches it, not a runtime surprise) — conversions are always
  explicit (`Number(paise) / 100` for display, `BigInt(...)` for input).
- Display formatting (`apps/web/src/lib/format.ts`) converts to `Number`
  only at the very last step, for `toLocaleString` rendering — never for
  a value that flows back into a calculation.
- The one place this ADR is deliberately relaxed is `apps/engine/src/
  metrics.ts`'s incremental-₹ extrapolation, which multiplies a
  floating-point rate difference by an average exposure — this is a
  reporting estimate built on top of exact bigint sums, not itself a
  stored balance, so float precision there is an acceptable trade for
  readable percentages and CIs.
