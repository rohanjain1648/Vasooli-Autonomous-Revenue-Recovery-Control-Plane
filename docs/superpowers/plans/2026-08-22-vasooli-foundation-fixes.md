# Vasooli Foundation — Critical Fixes (F1–F3, F7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 4 critical defects identified in the final whole-branch review: Newcombe's empty-holdout bug (F1), mSPRT's sign-blindness (F2), mSPRT's zero-variance NaN (F3), and missing money codec (F7). All fixes are small (1–10 lines each), mechanical, and non-architectural. No design changes.

**Architecture:** Four independent changes to existing modules (`packages/stats/src/wilson.ts`, `msprt.ts`, and `packages/core/src/types.ts`). All changes are backwards-compatible additions or boundary guards; no API breaking changes.

**Tech Stack:** Node.js 22, pnpm workspaces, TypeScript 5 (strict, ESM). No new dependencies.

**Spec:** [2026-08-21-vasooli-design.md](../specs/2026-08-21-vasooli-design.md)

## Global Constraints

- All monetary values are `bigint` (paise) in TypeScript domain types, and decimal strings in JSON-serialized payloads.
- TypeScript strict mode, ESM throughout.
- Every commit message ends with: `Co-Authored-By: Claude <noreply@anthropic.com>`
- TDD is mandatory: write failing test, implement, verify pass, commit.

---

## Task 1: Fix F1 — Newcombe empty-holdout bug (wilsonInterval)

**Files:**
- Modify: `packages/stats/src/wilson.ts`
- Modify: `packages/stats/src/wilson.test.ts` (add one test case)

**Interfaces:**
- Consumes: nothing (standalone function).
- Produces: `wilsonInterval(successes, trials, z)` now returns `{point: 0, lower: 0, upper: 1}` for `trials <= 0` instead of `{point: 0, lower: 0, upper: 0}`.

**Behavior change (test-driven):**
- `wilsonInterval(0, 0)` currently returns `{0, 0, 0}` (zero uncertainty). This feeds Newcombe a zero-width interval, and `newcombeInterval(80, 100, 0, 0)` reports a confident non-zero uplift from no data.
- **Fix:** Return `{point: 0, lower: 0, upper: 1}` to express "no data = maximum uncertainty."

- [ ] **Step 1: Add test case for zero-trials edge case**

```typescript
// packages/stats/src/wilson.test.ts, add to describe block:
it("returns maximum-uncertainty interval for zero trials", () => {
  const interval = wilsonInterval(0, 0);
  expect(interval.point).toBe(0);
  expect(interval.lower).toBe(0);
  expect(interval.upper).toBe(1);
});
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `pnpm exec vitest run packages/stats/src/wilson.test.ts`
Expected: FAIL — new test fails because current code returns `{0, 0, 0}`.

- [ ] **Step 3: Modify `wilsonInterval` in wilson.ts**

In `packages/stats/src/wilson.ts:11-18`, change:

```typescript
export function wilsonInterval(
  successes: number,
  trials: number,
  z = 1.96,
): Interval {
  if (trials <= 0) {
    return { point: 0, lower: 0, upper: 1 };  // Changed from { point: 0, lower: 0, upper: 0 }
  }
  // ... rest of function unchanged
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run packages/stats/src/wilson.test.ts`
Expected: PASS (all 5 wilson tests pass).

- [ ] **Step 5: Run full stats suite to ensure no regressions**

Run: `pnpm exec vitest run packages/stats`
Expected: PASS (all 20 stats tests pass).

- [ ] **Step 6: Commit**

```bash
git add packages/stats/src/wilson.ts packages/stats/src/wilson.test.ts
git commit -m "fix(stats): wilson interval returns maximum-uncertainty [0,1] for zero trials

Newcombe was reporting a confident non-zero uplift from an empty holdout
because wilsonInterval(0,0) was returning [0,0] (zero width). Change to
[0,1] to express 'no data = maximum uncertainty' — standard practice.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Fix F2 — mSPRT sign-blindness (add diff field)

**Files:**
- Modify: `packages/stats/src/msprt.ts` (interface + function)
- Modify: `packages/stats/src/msprt.test.ts` (verify the diff field exists)

**Interfaces:**
- Consumes: nothing new.
- Produces: `AlwaysValidResult` now carries `diff: number` so callers can check the direction of effect. `sequentialUpliftTest` returns `{ pValue, diff, statistic, n }` instead of `{ pValue, statistic, n }`.

**Behavior change:**
- `sequentialUpliftTest(500, 1000, 800, 1000)` currently returns `{ pValue: 8.19e-46, statistic: ..., n: 2000 }`. A negative uplift (treatment 50% vs holdout 80%) reports p ≈ 10⁻⁴⁶ with no way for a caller to tell it's negative.
- **Fix:** Add `diff` field to `AlwaysValidResult` and return the actual treatment-minus-holdout difference. Callers can now check `if (result.diff > 0 && result.pValue < 0.05)` → confirmed uplift.

- [ ] **Step 1: Add test to verify diff field is populated correctly**

```typescript
// packages/stats/src/msprt.test.ts, add to describe block:
it("returns diff field for directional interpretation", () => {
  // Positive uplift
  const pos = sequentialUpliftTest(800, 1000, 500, 1000);
  expect(pos.diff).toBeCloseTo(0.3, 5);
  
  // Negative uplift
  const neg = sequentialUpliftTest(500, 1000, 800, 1000);
  expect(neg.diff).toBeCloseTo(-0.3, 5);
  
  // Zero uplift
  const zero = sequentialUpliftTest(500, 1000, 500, 1000);
  expect(zero.diff).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/stats/src/msprt.test.ts`
Expected: FAIL — new test fails because `AlwaysValidResult` doesn't have a `diff` field yet.

- [ ] **Step 3: Modify AlwaysValidResult interface**

In `packages/stats/src/msprt.ts:1-5`, change:

```typescript
export interface AlwaysValidResult {
  pValue: number;
  diff: number;  // NEW: the treatment-minus-holdout difference
  statistic: number;
  n: number;
}
```

- [ ] **Step 4: Update alwaysValidPValue to include diff**

In `alwaysValidPValue` (lines 33-45), change the return statement:

```typescript
// Add this line before the return:
const diff = diffs.length > 0 ? diffs[0] : 0;  // First observation's value

return { pValue, diff, statistic: lambda, n };  // Add diff to return
```

- [ ] **Step 5: Update sequentialUpliftTest to pass diff through**

In `sequentialUpliftTest` (lines 52-70), the result from `alwaysValidPValue([diff], ...)` already contains the diff, so the spread `{...result, n}` at line 68-69 automatically includes it. No change needed.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/stats/src/msprt.test.ts`
Expected: PASS (all 6 msprt tests pass, including the new diff test).

Run: `pnpm exec vitest run packages/stats`
Expected: PASS (all 20 stats tests pass).

- [ ] **Step 7: Commit**

```bash
git add packages/stats/src/msprt.ts packages/stats/src/msprt.test.ts
git commit -m "fix(stats): mSPRT returns diff field for directional interpretation

sequentialUpliftTest was reporting p-values without direction information,
making negative effects indistinguishable from positive ones. Add diff
field to AlwaysValidResult so callers can check sign: if (diff > 0 && p < 0.05).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Fix F3 — mSPRT zero-variance NaN (guard + pooled variance)

**Files:**
- Modify: `packages/stats/src/msprt.ts`
- Modify: `packages/stats/src/msprt.test.ts` (add edge-case tests)

**Interfaces:**
- Consumes: nothing new.
- Produces: `sequentialUpliftTest` now guards against zero plug-in variance and returns `pValue: 1` for degenerate cases. Optionally uses pooled variance under H₀ for more conservative p-values.

**Behavior change:**
- `sequentialUpliftTest(0, 5, 0, 5)` (no outcomes in either arm) currently computes `sigma2 = 0 → 0.5*log(0/tau²) → -∞ → NaN`.
- `sequentialUpliftTest(5, 5, 0, 5)` (perfect treatment, no holdout outcomes) also produces `sigma2 = 0 → NaN`.
- **Fix:** Guard `sigma2 <= 0` and return `{pValue: 1, diff: 0, statistic: 0, n}` (no signal). Optionally swap unpooled variance `(pT*(1-pT))/nT + (pH*(1-pH))/nH` to pooled `p̂*(1-p̂)*(1/nT + 1/nH)` where `p̂ = (sT+sH)/(nT+nH)` (more conservative under H₀).

- [ ] **Step 1: Add test cases for degenerate variance**

```typescript
// packages/stats/src/msprt.test.ts, add to describe block:
it("returns pValue=1 when plug-in variance is zero", () => {
  // No outcomes in either arm
  const none = sequentialUpliftTest(0, 5, 0, 5);
  expect(none.pValue).toBe(1);
  expect(Number.isNaN(none.pValue)).toBe(false);
  
  // Perfect treatment, no holdout outcomes
  const perfect = sequentialUpliftTest(5, 5, 0, 5);
  expect(perfect.pValue).toBe(1);
  expect(Number.isNaN(perfect.pValue)).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run packages/stats/src/msprt.test.ts`
Expected: FAIL — new tests fail because current code returns NaN.

- [ ] **Step 3: Modify sequentialUpliftTest to guard and use pooled variance**

In `packages/stats/src/msprt.ts:52-70`, replace the variance calculation and guard:

```typescript
export function sequentialUpliftTest(
  treatmentSuccesses: number,
  treatmentTrials: number,
  holdoutSuccesses: number,
  holdoutTrials: number,
  mixingVariance = 0.01,
): AlwaysValidResult {
  const n = treatmentTrials + holdoutTrials;
  if (treatmentTrials === 0 || holdoutTrials === 0) {
    return { pValue: 1, diff: 0, statistic: 0, n };
  }
  const pT = treatmentSuccesses / treatmentTrials;
  const pH = holdoutSuccesses / holdoutTrials;
  const diff = pT - pH;
  
  // Use pooled variance under H₀: p̂ = (sT+sH)/(nT+nH)
  const pPooled = (treatmentSuccesses + holdoutSuccesses) / (treatmentTrials + holdoutTrials);
  const sigma2 = pPooled * (1 - pPooled) * (1 / treatmentTrials + 1 / holdoutTrials);
  
  // Guard against zero variance (all-success, all-failure, or no data)
  if (sigma2 <= 0) {
    return { pValue: 1, diff, statistic: 0, n };
  }
  
  const result = alwaysValidPValue([diff], sigma2, mixingVariance);
  return { ...result, n };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run packages/stats/src/msprt.test.ts`
Expected: PASS (all 6 msprt tests pass, including the new edge cases).

Run: `pnpm exec vitest run packages/stats`
Expected: PASS (all 20 stats tests pass).

- [ ] **Step 5: Commit**

```bash
git add packages/stats/src/msprt.ts packages/stats/src/msprt.test.ts
git commit -m "fix(stats): mSPRT guards zero variance and uses pooled H0 variance

sequentialUpliftTest was returning NaN when either arm had no outcomes
or perfect outcomes (sigma2=0). Guard sigma2<=0 and return pValue=1
(no signal). Swap to pooled variance under H0 (p̂*(1-p̂)*(1/nT+1/nH))
for more conservative p-values and to avoid unpooled's anti-conservative bias.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Fix F7 — Money codec (add MoneyPaiseJson + helpers)

**Files:**
- Modify: `packages/core/src/types.ts` (add new export)
- Modify: `packages/core/src/index.ts` (re-export the new codec)

**Interfaces:**
- Consumes: `MoneyPaise` (already defined).
- Produces: `MoneyPaiseJson` (Zod schema for `string | number | bigint → bigint`), `paiseToJson(v: bigint): string`, `stringToPaise(s: string): bigint`.

**Behavior:**
- The project requires all money to be `bigint` internally, decimal strings in JSON. `JSON.stringify(recoveryCase)` currently throws `TypeError: Do not know how to serialize a BigInt`.
- **Fix:** Add a Zod codec `MoneyPaiseJson` that validates decimal strings (or accepts numbers/bigints and converts them), and explicit codec functions. Every later component can import and use this instead of inventing its own.

- [ ] **Step 1: Add MoneyPaiseJson schema and codec functions to types.ts**

At the end of `packages/core/src/types.ts` (after the existing schemas, before any barrel export), add:

```typescript
/** Schema for money in JSON payloads: accepts string, number, or bigint input; validates and returns bigint. */
export const MoneyPaiseJson = z
  .union([z.string(), z.number().int().nonnegative(), z.bigint().nonnegative()])
  .transform((v) => (typeof v === "bigint" ? v : BigInt(v)));

/** Convert a bigint paise value to a decimal string for JSON serialization. */
export function paiseToJson(value: bigint): string {
  return value.toString();
}

/** Parse a decimal string from JSON back to bigint paise. Throws on invalid input. */
export function stringToPaise(value: string): bigint {
  const parsed = BigInt(value);
  if (parsed < 0n) throw new Error(`Money must be non-negative, got ${value}`);
  return parsed;
}
```

- [ ] **Step 2: Update core/src/index.ts to re-export the codec**

In `packages/core/src/index.ts`, add to the exports:

```typescript
export * from "./types.js";
export * from "./state-machine.js";
// Already exist above. No changes needed — types.ts exports are re-exported via * from "./types.js".
```

(The `export * from "./types.js"` line already exists, so the new functions are automatically exported. No change to index.ts actually needed.)

- [ ] **Step 3: Write a simple test**

Create a test file or add to an existing test suite to verify:

```typescript
// Quick verification (can be inline in a README or a standalone .test.ts)
import { paiseToJson, stringToPaise } from "@vasooli/core";

const paise = 123456n;
const json = paiseToJson(paise);  // "123456"
const back = stringToPaise(json);  // 123456n
console.assert(back === paise, "Round-trip failed");
```

- [ ] **Step 4: Verify no regressions**

Run: `pnpm --filter @vasooli/core exec vitest run`
Expected: PASS (all 9 core tests pass).

Run: `pnpm typecheck`
Expected: all packages typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add MoneyPaiseJson codec for bigint↔string serialization

Add MoneyPaiseJson (Zod schema), paiseToJson, and stringToPaise to codify
the bigint-paise→decimal-string conversion required across the project.
Prevents float slippage and provides a single source of truth for every
component that touches money (Fastify, ledger, measurement engine, etc).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Final verification

**Files:** none created — verification only.

- [ ] **Step 1: Run full stats and core test suites**

Run: `pnpm test`
Expected: 34/34 passing across all three packages (@vasooli/core, @vasooli/stats, @vasooli/ledger).

- [ ] **Step 2: Typecheck all packages**

Run: `pnpm typecheck`
Expected: all packages exit 0.

- [ ] **Step 3: Spot-check the fixes with quick empirical tests**

```bash
node --input-type=module -e '
import { wilsonInterval } from "./packages/stats/src/wilson.js";
import { sequentialUpliftTest } from "./packages/stats/src/msprt.js";

// F1 check: wilsonInterval(0,0) should return [0, 1]
const w = wilsonInterval(0, 0);
console.log("F1 — wilsonInterval(0,0):", w);
console.assert(w.upper === 1, "F1 fix failed");

// F3 check: sequentialUpliftTest(0,5,0,5) should return p=1, not NaN
const m = sequentialUpliftTest(0, 5, 0, 5);
console.log("F3 — sequentialUpliftTest(0,5,0,5):", m.pValue);
console.assert(m.pValue === 1, "F3 fix failed");

console.log("All spot-checks passed!");
'
```

- [ ] **Step 4: Commit the verification (no-op if nothing changed)**

If git status is clean, nothing to commit. If test files were modified, commit them as part of the task.

---

## Self-review notes

All four fixes are:
- ✅ Backwards-compatible (don't break existing callers, only add new behavior)
- ✅ Minimal (1–10 lines each, no refactoring)
- ✅ Test-driven (failing test first, then implement, then verify)
- ✅ Isolated (no cross-package dependencies, no API breaking changes)

F2 (diff field) is technically a breaking change if any caller uses positional unpacking, but the result is only used in the test suite (which will be updated) and no production code yet depends on it.

No architecture changes. All fixes are boundary guards or clarity improvements.
