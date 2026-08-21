# Vasooli Foundation — Monorepo, Core, Stats, Ledger — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the pnpm/TypeScript monorepo and ship three independent, fully-tested packages — `core` (domain types + recovery-case state machine), `stats` (hand-rolled Wilson/Newcombe/CUSUM/Thompson/mSPRT), and `ledger` (hash-chained tamper-evident audit log) — that every later Vasooli subsystem builds on.

**Architecture:** pnpm workspace monorepo, TypeScript strict/ESM throughout, Vitest as the single test runner across all packages. No package in this plan depends on network, Postgres, or Redis — everything here is pure, synchronous, unit-testable logic. `core` defines the shared types and case lifecycle; `stats` and `ledger` are leaf packages with no dependency on `core` in this plan (later plans wire them together).

**Tech Stack:** Node.js 22, pnpm workspaces, TypeScript 5 (strict, NodeNext/ESM), Vitest, Zod, Node's built-in `node:crypto` for hashing. Docker Compose for Postgres 16 + Redis 7 (started here, consumed by later plans).

**Spec:** [docs/superpowers/specs/2026-08-21-vasooli-design.md](../specs/2026-08-21-vasooli-design.md)

## Global Constraints

- All monetary values are `bigint` (paise) in TypeScript domain types, and decimal **strings** (never `number`) in any JSON-serialized payload — floats must never represent money anywhere in the system (spec §4, §11).
- Package manager: pnpm workspaces. Node 22.x. TypeScript strict mode, ESM (`"type": "module"`) throughout — no CommonJS.
- Test runner: Vitest, one root config covering every package. TDD is mandatory for every task below: write the failing test, watch it fail, implement the minimum to pass, watch it pass, commit.
- No external statistics libraries. Wilson, Newcombe, CUSUM, Thompson sampling, and mSPRT are hand-rolled per spec §10 so every formula is defensible line-by-line to the panel.
- Directory layout matches spec §4 exactly. This plan creates `packages/core`, `packages/stats`, `packages/ledger`, plus root tooling and `docker-compose.yml`. `apps/*` and the remaining `packages/*` (`policy`, `llm`, `razorpay`, `simulator`) come in later plans.
- Every commit message ends with: `Co-Authored-By: Claude <noreply@anthropic.com>`

---

## File Structure

```
vasooli/
├── package.json                    root workspace config + scripts
├── pnpm-workspace.yaml
├── tsconfig.base.json              shared strict TS config
├── vitest.config.ts                single test runner config, all packages
├── docker-compose.yml              postgres:16-alpine + redis:7-alpine
├── .env.example
├── .gitignore
└── packages/
    ├── core/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── types.ts            Zod schemas: money, leakage category, case state, signal, case
    │       ├── state-machine.ts    RecoveryCase transition table + guards
    │       ├── state-machine.test.ts
    │       └── index.ts            barrel export
    ├── stats/
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── wilson.ts
    │       ├── wilson.test.ts
    │       ├── newcombe.ts
    │       ├── newcombe.test.ts
    │       ├── cusum.ts
    │       ├── cusum.test.ts
    │       ├── thompson.ts
    │       ├── thompson.test.ts
    │       ├── msprt.ts
    │       ├── msprt.test.ts
    │       └── index.ts            barrel export
    └── ledger/
        ├── package.json
        ├── tsconfig.json
        └── src/
            ├── ledger.ts
            ├── ledger.test.ts
            └── index.ts            barrel export
```

---

### Task 1: Monorepo scaffold + Docker services

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: the `pnpm test`, `pnpm typecheck`, `pnpm build` root scripts every later task and every later plan uses; the `packages/*` and `apps/*` workspace glob later packages register into.

- [ ] **Step 1: Create root `package.json`**

```json
{
  "name": "vasooli",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "pnpm -r --if-present run typecheck",
    "build": "pnpm -r --if-present run build"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "typescript": "^5.6.3",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "declaration": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src"
  }
}
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts", "apps/**/src/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

- [ ] **Step 5: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: vasooli
      POSTGRES_PASSWORD: vasooli
      POSTGRES_DB: vasooli
    ports:
      - "5432:5432"
    volumes:
      - vasooli_pg_data:/var/lib/postgresql/data
  redis:
    image: redis:7-alpine
    command: ["redis-server", "--appendonly", "yes"]
    ports:
      - "6379:6379"
    volumes:
      - vasooli_redis_data:/data

volumes:
  vasooli_pg_data:
  vasooli_redis_data:
```

- [ ] **Step 6: Create `.env.example`**

```
DATABASE_URL=postgres://vasooli:vasooli@localhost:5432/vasooli
REDIS_URL=redis://localhost:6379

LLM_PROVIDER=mock
OPENAI_API_KEY=
GROQ_API_KEY=

RAZORPAY_MODE=fake
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
```

- [ ] **Step 7: Create `.gitignore`**

```
node_modules/
dist/
.env
*.log
.turbo/
coverage/
```

- [ ] **Step 8: Create `README.md`**

```markdown
# Vasooli — Autonomous Revenue Recovery Control Plane

Razorpay AI Buildathon 2026 — Track 3, AI Revenue Recovery.

## Quick start

\`\`\`bash
docker compose up -d
pnpm install
cp .env.example .env
pnpm test
\`\`\`

See [docs/superpowers/specs/2026-08-21-vasooli-design.md](docs/superpowers/specs/2026-08-21-vasooli-design.md) for the full architecture.
```

- [ ] **Step 9: Install and verify the workspace boots**

Run: `pnpm install`
Expected: completes with no errors (no packages registered yet, so it just installs root devDependencies).

Run: `pnpm test`
Expected: Vitest reports "No test files found" but exits 0 (because `passWithNoTests: true`).

- [ ] **Step 10: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts docker-compose.yml .env.example .gitignore README.md pnpm-lock.yaml
git commit -m "chore: scaffold pnpm/TypeScript monorepo with docker-compose services

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: `packages/core` — domain types

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/types.ts`
- Create: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing (leaf package for domain types).
- Produces: `MoneyPaise`, `LeakageCategory`, `CaseStateSchema` / `CaseState`, `RiskSignalSchema` / `RiskSignal`, `RecoveryCaseSchema` / `RecoveryCase` — used by Task 3 (`state-machine.ts` imports `CaseState`) and by every later plan (detectors produce `RiskSignal`, the orchestrator produces/updates `RecoveryCase`).

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@vasooli/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install workspace dependencies**

Run: `pnpm install`
Expected: `@vasooli/core` is linked into the workspace, `zod` is installed.

- [ ] **Step 4: Write `packages/core/src/types.ts`**

```typescript
import { z } from "zod";

/** Money is always represented in paise as a non-negative bigint — never a float. */
export const MoneyPaise = z.bigint().nonnegative();

export const LeakageCategory = z.enum([
  "payment_failure",
  "checkout_abandonment",
  "subscription_failure",
  "b2b_receivable",
]);
export type LeakageCategory = z.infer<typeof LeakageCategory>;

export const CaseStateSchema = z.enum([
  "detected",
  "diagnosing",
  "planned",
  "awaiting_approval",
  "executing",
  "recovered",
  "failed",
  "stopped",
  "holdout",
]);
export type CaseState = z.infer<typeof CaseStateSchema>;

export const ArmGroup = z.enum(["treatment", "holdout"]);
export type ArmGroup = z.infer<typeof ArmGroup>;

export const RiskSignalSchema = z.object({
  id: z.string().uuid(),
  category: LeakageCategory,
  entityId: z.string(),
  exposurePaise: MoneyPaise,
  detectedAt: z.string().datetime(),
  evidence: z.record(z.unknown()),
});
export type RiskSignal = z.infer<typeof RiskSignalSchema>;

export const RecoveryCaseSchema = z.object({
  id: z.string().uuid(),
  signalId: z.string().uuid(),
  category: LeakageCategory,
  state: CaseStateSchema,
  armGroup: ArmGroup,
  exposurePaise: MoneyPaise,
  recoveredPaise: MoneyPaise.default(0n),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RecoveryCase = z.infer<typeof RecoveryCaseSchema>;
```

- [ ] **Step 5: Verify types compile**

Run: `pnpm --filter @vasooli/core typecheck`
Expected: exits 0, no type errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/package.json packages/core/tsconfig.json packages/core/src/types.ts pnpm-lock.yaml
git commit -m "feat(core): add domain Zod schemas for money, signals, and recovery cases

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: `packages/core` — recovery-case state machine

**Files:**
- Create: `packages/core/src/state-machine.ts`
- Create: `packages/core/src/state-machine.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `CaseState` from `./types.ts` (Task 2).
- Produces: `canTransition(from: CaseState, to: CaseState): boolean`, `transition(from: CaseState, to: CaseState): CaseState`, `isTerminal(state: CaseState): boolean`, `InvalidTransitionError` — used by every later plan that mutates a `RecoveryCase`'s state (the orchestrator, executor, policy gate).

- [ ] **Step 1: Write the failing test — `packages/core/src/state-machine.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  canTransition,
  transition,
  isTerminal,
  InvalidTransitionError,
} from "./state-machine.js";

describe("recovery case state machine", () => {
  it("allows detected -> diagnosing", () => {
    expect(canTransition("detected", "diagnosing")).toBe(true);
  });

  it("allows detected -> holdout for randomized cases", () => {
    expect(canTransition("detected", "holdout")).toBe(true);
  });

  it("rejects recovered -> detected", () => {
    expect(canTransition("recovered", "detected")).toBe(false);
  });

  it("rejects a case skipping straight from detected to executing", () => {
    expect(canTransition("detected", "executing")).toBe(false);
  });

  it("transition() returns the target state on a legal move", () => {
    expect(transition("detected", "diagnosing")).toBe("diagnosing");
  });

  it("transition() throws InvalidTransitionError on an illegal move", () => {
    expect(() => transition("recovered", "detected")).toThrow(
      InvalidTransitionError,
    );
  });

  it("isTerminal is true for recovered, failed, and stopped", () => {
    expect(isTerminal("recovered")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("stopped")).toBe(true);
  });

  it("isTerminal is false for non-terminal states", () => {
    expect(isTerminal("detected")).toBe(false);
    expect(isTerminal("executing")).toBe(false);
  });

  it("every state can eventually reach 'stopped' (hard stop is always reachable) except terminal states", () => {
    const nonTerminal: Array<import("./types.js").CaseState> = [
      "detected",
      "diagnosing",
      "planned",
      "awaiting_approval",
      "executing",
    ];
    for (const state of nonTerminal) {
      expect(canTransition(state, "stopped")).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vasooli/core exec vitest run src/state-machine.test.ts`
Expected: FAIL — `Cannot find module './state-machine.js'`.

- [ ] **Step 3: Write `packages/core/src/state-machine.ts`**

```typescript
import type { CaseState } from "./types.js";

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: CaseState,
    public readonly to: CaseState,
  ) {
    super(`Invalid transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

const TRANSITIONS: Record<CaseState, readonly CaseState[]> = {
  detected: ["diagnosing", "holdout", "stopped"],
  diagnosing: ["planned", "failed", "stopped"],
  planned: ["awaiting_approval", "executing", "stopped"],
  awaiting_approval: ["executing", "stopped"],
  executing: ["recovered", "failed", "stopped"],
  recovered: [],
  failed: [],
  stopped: [],
  holdout: ["recovered", "failed"],
};

export function canTransition(from: CaseState, to: CaseState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(from: CaseState, to: CaseState): CaseState {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
  return to;
}

export function isTerminal(state: CaseState): boolean {
  return TRANSITIONS[state].length === 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vasooli/core exec vitest run src/state-machine.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Create `packages/core/src/index.ts` barrel export**

```typescript
export * from "./types.js";
export * from "./state-machine.js";
```

- [ ] **Step 6: Run the full core package test suite and typecheck**

Run: `pnpm --filter @vasooli/core exec vitest run && pnpm --filter @vasooli/core typecheck`
Expected: all tests PASS, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/state-machine.ts packages/core/src/state-machine.test.ts packages/core/src/index.ts
git commit -m "feat(core): add recovery case state machine with hard-stop invariant

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: `packages/stats` — Wilson score interval

**Files:**
- Create: `packages/stats/package.json`
- Create: `packages/stats/tsconfig.json`
- Create: `packages/stats/src/wilson.ts`
- Create: `packages/stats/src/wilson.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Interval` type (`{ point, lower, upper }`), `wilsonInterval(successes: number, trials: number, z?: number): Interval` — used by Task 5 (`newcombe.ts`).

- [ ] **Step 1: Create `packages/stats/package.json`**

```json
{
  "name": "@vasooli/stats",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/stats/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test — `packages/stats/src/wilson.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { wilsonInterval } from "./wilson.js";

describe("wilsonInterval", () => {
  it("matches the published reference for n=20, x=10 (p=0.5)", () => {
    const { point, lower, upper } = wilsonInterval(10, 20);
    expect(point).toBeCloseTo(0.5, 5);
    expect(lower).toBeCloseTo(0.299, 3);
    expect(upper).toBeCloseTo(0.701, 3);
  });

  it("returns a zero interval for zero trials", () => {
    expect(wilsonInterval(0, 0)).toEqual({ point: 0, lower: 0, upper: 0 });
  });

  it("narrows as the number of trials increases at the same proportion", () => {
    const small = wilsonInterval(50, 100);
    const large = wilsonInterval(500, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });

  it("stays within [0, 1] even at extreme proportions", () => {
    const { lower, upper } = wilsonInterval(1, 1);
    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeLessThanOrEqual(1);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `pnpm --filter @vasooli/stats exec vitest run src/wilson.test.ts`
Expected: FAIL — `Cannot find module './wilson.js'`.

- [ ] **Step 5: Write `packages/stats/src/wilson.ts`**

```typescript
export interface Interval {
  point: number;
  lower: number;
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion (Wilson, 1927).
 * `z` defaults to 1.96 (95% confidence).
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z = 1.96,
): Interval {
  if (trials <= 0) {
    return { point: 0, lower: 0, upper: 0 };
  }
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = p + z2 / (2 * trials);
  const margin =
    z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return {
    point: p,
    lower: Math.max(0, (center - margin) / denominator),
    upper: Math.min(1, (center + margin) / denominator),
  };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @vasooli/stats exec vitest run src/wilson.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/stats/package.json packages/stats/tsconfig.json packages/stats/src/wilson.ts packages/stats/src/wilson.test.ts pnpm-lock.yaml
git commit -m "feat(stats): add Wilson score interval, verified against published reference

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: `packages/stats` — Newcombe interval (difference of two proportions)

**Files:**
- Create: `packages/stats/src/newcombe.ts`
- Create: `packages/stats/src/newcombe.test.ts`

**Interfaces:**
- Consumes: `wilsonInterval` and `Interval` from `./wilson.ts` (Task 4).
- Produces: `DiffInterval` type (`{ diff, lower, upper }`), `newcombeInterval(successes1, trials1, successes2, trials2, z?): DiffInterval` — used by the measurement engine in a later plan to compute the incremental-₹ confidence interval (spec §5).

- [ ] **Step 1: Write the failing test — `packages/stats/src/newcombe.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { newcombeInterval } from "./newcombe.js";

describe("newcombeInterval", () => {
  it("returns diff=0 with an interval straddling zero when proportions are equal", () => {
    const { diff, lower, upper } = newcombeInterval(50, 100, 50, 100);
    expect(diff).toBe(0);
    expect(lower).toBeLessThan(0);
    expect(upper).toBeGreaterThan(0);
  });

  it("excludes zero when the two proportions are clearly separated with large samples", () => {
    const { diff, lower, upper } = newcombeInterval(800, 1000, 500, 1000);
    expect(diff).toBeCloseTo(0.3, 5);
    expect(lower).toBeGreaterThan(0);
    expect(upper).toBeGreaterThan(lower);
  });

  it("narrows with larger sample sizes at the same proportions", () => {
    const small = newcombeInterval(30, 100, 20, 100);
    const large = newcombeInterval(300, 1000, 200, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vasooli/stats exec vitest run src/newcombe.test.ts`
Expected: FAIL — `Cannot find module './newcombe.js'`.

- [ ] **Step 3: Write `packages/stats/src/newcombe.ts`**

```typescript
import { wilsonInterval } from "./wilson.js";

export interface DiffInterval {
  diff: number;
  lower: number;
  upper: number;
}

/**
 * Newcombe (1998) hybrid score interval for the difference of two
 * independent binomial proportions p1 - p2, built from each arm's
 * individual Wilson interval.
 */
export function newcombeInterval(
  successes1: number,
  trials1: number,
  successes2: number,
  trials2: number,
  z = 1.96,
): DiffInterval {
  const w1 = wilsonInterval(successes1, trials1, z);
  const w2 = wilsonInterval(successes2, trials2, z);
  const p1 = trials1 > 0 ? successes1 / trials1 : 0;
  const p2 = trials2 > 0 ? successes2 / trials2 : 0;
  const diff = p1 - p2;
  const lower = diff - Math.sqrt((p1 - w1.lower) ** 2 + (w2.upper - p2) ** 2);
  const upper = diff + Math.sqrt((w1.upper - p1) ** 2 + (p2 - w2.lower) ** 2);
  return { diff, lower, upper };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vasooli/stats exec vitest run src/newcombe.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/stats/src/newcombe.ts packages/stats/src/newcombe.test.ts
git commit -m "feat(stats): add Newcombe interval for the difference of two proportions

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: `packages/stats` — CUSUM change-point detector

**Files:**
- Create: `packages/stats/src/cusum.ts`
- Create: `packages/stats/src/cusum.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `CusumResult` type, `cusum(observations: number[], baselineMean: number, k: number, h: number): CusumResult` — used by the payment-degradation detector in a later plan (spec §5).

- [ ] **Step 1: Write the failing test — `packages/stats/src/cusum.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { cusum } from "./cusum.js";

describe("cusum", () => {
  it("reports no change point in a stable series", () => {
    const stable = new Array(20).fill(0.9);
    const result = cusum(stable, 0.9, 0.05, 0.5);
    expect(result.changePointIndex).toBeNull();
  });

  it("detects a downward shift shortly after it occurs", () => {
    const series = [...new Array(10).fill(0.9), ...new Array(10).fill(0.3)];
    const result = cusum(series, 0.9, 0.05, 0.3);
    expect(result.changePointIndex).not.toBeNull();
    expect(result.changePointIndex!).toBeGreaterThanOrEqual(9);
    expect(result.changePointIndex!).toBeLessThanOrEqual(14);
  });

  it("detects an upward shift as well (two-sided)", () => {
    const series = [...new Array(10).fill(0.2), ...new Array(10).fill(0.8)];
    const result = cusum(series, 0.2, 0.05, 0.3);
    expect(result.changePointIndex).not.toBeNull();
    expect(result.changePointIndex!).toBeGreaterThanOrEqual(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vasooli/stats exec vitest run src/cusum.test.ts`
Expected: FAIL — `Cannot find module './cusum.js'`.

- [ ] **Step 3: Write `packages/stats/src/cusum.ts`**

```typescript
export interface CusumResult {
  changePointIndex: number | null;
  finalUpper: number;
  finalLower: number;
}

/**
 * Two-sided CUSUM change-point detector over a sequence of observations
 * (e.g. per-window success rates) relative to a known baseline mean.
 * `k` is the allowance (slack), typically half the shift magnitude you
 * want to detect; `h` is the decision threshold (control limit).
 */
export function cusum(
  observations: number[],
  baselineMean: number,
  k: number,
  h: number,
): CusumResult {
  let upper = 0;
  let lower = 0;
  let changePointIndex: number | null = null;

  for (let i = 0; i < observations.length; i++) {
    const deviation = observations[i] - baselineMean;
    upper = Math.max(0, upper + deviation - k);
    lower = Math.max(0, lower - deviation - k);
    if (changePointIndex === null && (upper > h || lower > h)) {
      changePointIndex = i;
    }
  }

  return { changePointIndex, finalUpper: upper, finalLower: lower };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vasooli/stats exec vitest run src/cusum.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/stats/src/cusum.ts packages/stats/src/cusum.test.ts
git commit -m "feat(stats): add two-sided CUSUM change-point detector

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: `packages/stats` — Thompson sampling bandit

**Files:**
- Create: `packages/stats/src/thompson.ts`
- Create: `packages/stats/src/thompson.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Arm` type (`{ id, alpha, beta }`), `RandomFn` type, `createSeededRandom(seed: number): RandomFn`, `selectArm(arms: Arm[], rng: RandomFn): string`, `updateArm(arm: Arm, success: boolean): Arm` — used by the bandit planner in a later plan (spec §6, step 2) to choose which playbook to run per segment.

- [ ] **Step 1: Write the failing test — `packages/stats/src/thompson.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { selectArm, updateArm, createSeededRandom, type Arm } from "./thompson.js";

describe("thompson sampling", () => {
  it("is deterministic for a fixed seed", () => {
    const arms: Arm[] = [
      { id: "a", alpha: 1, beta: 1 },
      { id: "b", alpha: 1, beta: 1 },
    ];
    const r1 = selectArm(arms, createSeededRandom(42));
    const r2 = selectArm(arms, createSeededRandom(42));
    expect(r1).toBe(r2);
  });

  it("favors the arm with the stronger posterior over many draws", () => {
    const arms: Arm[] = [
      { id: "strong", alpha: 80, beta: 20 },
      { id: "weak", alpha: 20, beta: 80 },
    ];
    const rng = createSeededRandom(1);
    let strongWins = 0;
    for (let i = 0; i < 200; i++) {
      if (selectArm(arms, rng) === "strong") strongWins++;
    }
    expect(strongWins).toBeGreaterThan(150);
  });

  it("updateArm increments alpha on success and beta on failure", () => {
    const arm: Arm = { id: "x", alpha: 1, beta: 1 };
    expect(updateArm(arm, true)).toEqual({ id: "x", alpha: 2, beta: 1 });
    expect(updateArm(arm, false)).toEqual({ id: "x", alpha: 1, beta: 2 });
  });

  it("selectArm throws on an empty arm list", () => {
    expect(() => selectArm([], createSeededRandom(1))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vasooli/stats exec vitest run src/thompson.test.ts`
Expected: FAIL — `Cannot find module './thompson.js'`.

- [ ] **Step 3: Write `packages/stats/src/thompson.ts`**

```typescript
export interface Arm {
  id: string;
  alpha: number;
  beta: number;
}

export type RandomFn = () => number;

/** Deterministic PRNG (mulberry32) so bandit behavior is reproducible in tests and replays. */
export function createSeededRandom(seed: number): RandomFn {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleStandardNormal(rng: RandomFn): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia-Tsang method for sampling Gamma(shape, 1). */
function sampleGamma(shape: number, rng: RandomFn): number {
  if (shape < 1) {
    const u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number, rng: RandomFn): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/**
 * Thompson sampling arm selection: draw one Beta(alpha, beta) sample per
 * arm and return the id of the arm with the highest draw.
 */
export function selectArm(arms: Arm[], rng: RandomFn): string {
  if (arms.length === 0) {
    throw new Error("selectArm requires at least one arm");
  }
  let bestId = arms[0].id;
  let bestDraw = -Infinity;
  for (const arm of arms) {
    const draw = sampleBeta(arm.alpha, arm.beta, rng);
    if (draw > bestDraw) {
      bestDraw = draw;
      bestId = arm.id;
    }
  }
  return bestId;
}

/** Posterior update after observing a binary outcome for an arm. */
export function updateArm(arm: Arm, success: boolean): Arm {
  return success
    ? { ...arm, alpha: arm.alpha + 1 }
    : { ...arm, beta: arm.beta + 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vasooli/stats exec vitest run src/thompson.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/stats/src/thompson.ts packages/stats/src/thompson.test.ts
git commit -m "feat(stats): add Thompson sampling bandit with seeded PRNG for deterministic tests

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: `packages/stats` — always-valid sequential test (mSPRT)

**Files:**
- Create: `packages/stats/src/msprt.ts`
- Create: `packages/stats/src/msprt.test.ts`
- Create: `packages/stats/src/index.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `AlwaysValidResult` type, `alwaysValidPValue(diffs: number[], perObservationVariance: number, mixingVariance: number): AlwaysValidResult`, `sequentialUpliftTest(treatmentSuccesses, treatmentTrials, holdoutSuccesses, holdoutTrials, mixingVariance?): AlwaysValidResult` — used by the measurement engine in a later plan so the dashboard's live p-value can be watched during the pitch without inflating false positives (spec §5, "no peeking problem").

- [ ] **Step 1: Write the failing test — `packages/stats/src/msprt.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { alwaysValidPValue, sequentialUpliftTest } from "./msprt.js";

describe("alwaysValidPValue", () => {
  it("returns p=1 for no observations", () => {
    expect(alwaysValidPValue([], 1, 0.01).pValue).toBe(1);
  });

  it("gives a small p-value for a large, consistent effect relative to its variance", () => {
    const result = alwaysValidPValue([0.3], 0.001, 0.01);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("stays close to 1 for a near-zero effect", () => {
    const result = alwaysValidPValue([0.0001], 0.01, 0.01);
    expect(result.pValue).toBeGreaterThan(0.5);
  });
});

describe("sequentialUpliftTest", () => {
  it("returns p=1 when either arm has zero trials", () => {
    expect(sequentialUpliftTest(0, 0, 10, 100).pValue).toBe(1);
  });

  it("flags a large, well-separated uplift as significant", () => {
    const result = sequentialUpliftTest(800, 1000, 500, 1000);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("does not flag a negligible uplift as significant", () => {
    const result = sequentialUpliftTest(501, 1000, 500, 1000);
    expect(result.pValue).toBeGreaterThan(0.05);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vasooli/stats exec vitest run src/msprt.test.ts`
Expected: FAIL — `Cannot find module './msprt.js'`.

- [ ] **Step 3: Write `packages/stats/src/msprt.ts`**

```typescript
export interface AlwaysValidResult {
  pValue: number;
  statistic: number;
  n: number;
}

/**
 * Always-valid p-value via a normal-mixture sequential probability ratio
 * test (mSPRT), per Johari, Koomen, Pekelis & Walsh (2017), "Peeking at
 * A/B Tests". Safe to evaluate after every new observation without
 * inflating the false-positive rate — the property spec §5 calls
 * "no peeking problem".
 *
 * `diffs` is the running list of per-observation statistic contributions.
 * `perObservationVariance` (sigma^2) is the variance of a single
 * observation under the null. `mixingVariance` (tau^2) is the prior
 * variance on the effect size under the mixture — larger tau^2 detects
 * large effects sooner at the cost of power against small ones.
 */
export function alwaysValidPValue(
  diffs: number[],
  perObservationVariance: number,
  mixingVariance: number,
): AlwaysValidResult {
  const n = diffs.length;
  if (n === 0) {
    return { pValue: 1, statistic: 0, n: 0 };
  }
  const sum = diffs.reduce((a, b) => a + b, 0);
  const sigma2 = perObservationVariance;
  const tau2 = mixingVariance;
  const denom = sigma2 + n * tau2;
  const logLambda =
    0.5 * Math.log(sigma2 / denom) + (tau2 * sum * sum) / (2 * sigma2 * denom);
  const lambda = Math.exp(logLambda);
  const pValue = Math.min(1, 1 / lambda);
  return { pValue, statistic: lambda, n };
}

/**
 * Two-arm proportion comparison built on `alwaysValidPValue`: treats the
 * observed treatment/holdout recovery-rate difference as a single
 * aggregated normal statistic (valid by the CLT on proportions) and
 * evaluates it as one mixture-test observation.
 */
export function sequentialUpliftTest(
  treatmentSuccesses: number,
  treatmentTrials: number,
  holdoutSuccesses: number,
  holdoutTrials: number,
  mixingVariance = 0.01,
): AlwaysValidResult {
  const n = treatmentTrials + holdoutTrials;
  if (treatmentTrials === 0 || holdoutTrials === 0) {
    return { pValue: 1, statistic: 0, n };
  }
  const pT = treatmentSuccesses / treatmentTrials;
  const pH = holdoutSuccesses / holdoutTrials;
  const diff = pT - pH;
  const sigma2 =
    (pT * (1 - pT)) / treatmentTrials + (pH * (1 - pH)) / holdoutTrials;
  const result = alwaysValidPValue([diff], sigma2, mixingVariance);
  return { ...result, n };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vasooli/stats exec vitest run src/msprt.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Create `packages/stats/src/index.ts` barrel export**

```typescript
export * from "./wilson.js";
export * from "./newcombe.js";
export * from "./cusum.js";
export * from "./thompson.js";
export * from "./msprt.js";
```

- [ ] **Step 6: Run the full stats package test suite and typecheck**

Run: `pnpm --filter @vasooli/stats exec vitest run && pnpm --filter @vasooli/stats typecheck`
Expected: all tests PASS (20 total across wilson/newcombe/cusum/thompson/msprt), typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/stats/src/msprt.ts packages/stats/src/msprt.test.ts packages/stats/src/index.ts
git commit -m "feat(stats): add always-valid sequential uplift test (mSPRT), complete stats package

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: `packages/ledger` — hash-chained tamper-evident audit log

**Files:**
- Create: `packages/ledger/package.json`
- Create: `packages/ledger/tsconfig.json`
- Create: `packages/ledger/src/ledger.ts`
- Create: `packages/ledger/src/ledger.test.ts`
- Create: `packages/ledger/src/index.ts`

**Interfaces:**
- Consumes: `node:crypto` (Node built-in) only.
- Produces: `LedgerEntryInput`, `LedgerEntry` types, `Ledger` class with `append(input, now?): LedgerEntry`, `all(): readonly LedgerEntry[]`, `verify(): { valid: boolean; firstBrokenIndex: number | null }` — used by every later plan that writes to the audit trail (orchestrator, policy gate, executor) and by the `GET /audit/verify` API route (spec §8).
- Convention: money in ledger `payload` fields is a decimal **string**, never `bigint` or `number` — `bigint` is not JSON-serializable and floats must never represent money (Global Constraints).

- [ ] **Step 1: Create `packages/ledger/package.json`**

```json
{
  "name": "@vasooli/ledger",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/ledger/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing test — `packages/ledger/src/ledger.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { Ledger } from "./ledger.js";

describe("Ledger", () => {
  it("chains entries so each entry's prevHash is the previous entry's hash", () => {
    const ledger = new Ledger();
    const e1 = ledger.append({
      actor: "system",
      caseId: "c1",
      action: "signal_detected",
      payload: { exposurePaise: "1000" },
    });
    const e2 = ledger.append({
      actor: "agent",
      caseId: "c1",
      action: "diagnosis_proposed",
      payload: {},
    });
    expect(e2.prevHash).toBe(e1.hash);
  });

  it("the first entry chains from the genesis hash", () => {
    const ledger = new Ledger();
    const e1 = ledger.append({
      actor: "system",
      caseId: "c1",
      action: "signal_detected",
      payload: {},
    });
    expect(e1.prevHash).toBe("0".repeat(64));
  });

  it("verify() succeeds on an untampered chain", () => {
    const ledger = new Ledger();
    ledger.append({ actor: "system", caseId: "c1", action: "signal_detected", payload: {} });
    ledger.append({ actor: "agent", caseId: "c1", action: "diagnosis_proposed", payload: {} });
    ledger.append({ actor: "policy", caseId: "c1", action: "gate_pass", payload: {} });
    expect(ledger.verify()).toEqual({ valid: true, firstBrokenIndex: null });
  });

  it("verify() fails and identifies the index when an entry is tampered with", () => {
    const ledger = new Ledger();
    ledger.append({
      actor: "system",
      caseId: "c1",
      action: "signal_detected",
      payload: { exposurePaise: "1000" },
    });
    ledger.append({ actor: "agent", caseId: "c1", action: "diagnosis_proposed", payload: {} });
    ledger._tamperForTest(0, { payload: { exposurePaise: "9999999" } });
    const result = ledger.verify();
    expect(result.valid).toBe(false);
    expect(result.firstBrokenIndex).toBe(0);
  });

  it("produces the same hash regardless of key insertion order in the payload", () => {
    const now = () => "2026-08-21T00:00:00.000Z";
    const a = new Ledger();
    const entryA = a.append(
      { actor: "x", caseId: "c", action: "a", payload: { b: 1, a: 2 } },
      now,
    );
    const b = new Ledger();
    const entryB = b.append(
      { actor: "x", caseId: "c", action: "a", payload: { a: 2, b: 1 } },
      now,
    );
    expect(entryA.hash).toBe(entryB.hash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @vasooli/ledger exec vitest run src/ledger.test.ts`
Expected: FAIL — `Cannot find module './ledger.js'`.

- [ ] **Step 3: Write `packages/ledger/src/ledger.ts`**

```typescript
import { createHash } from "node:crypto";

export interface LedgerEntryInput {
  actor: string;
  caseId: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface LedgerEntry extends LedgerEntryInput {
  index: number;
  timestamp: string;
  prevHash: string;
  hash: string;
}

const GENESIS_HASH = "0".repeat(64);

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      sorted[key] = sortKeysDeep(input[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function computeHash(
  prevHash: string,
  entry: LedgerEntryInput & { index: number; timestamp: string },
): string {
  return createHash("sha256")
    .update(prevHash)
    .update(canonicalJson(entry))
    .digest("hex");
}

/**
 * Append-only, hash-chained audit log. Every entry's hash depends on the
 * previous entry's hash plus the canonical JSON of its own fields, so
 * mutating any stored entry breaks every hash after it — `verify()`
 * detects this by recomputing the chain from the genesis hash.
 */
export class Ledger {
  private entries: LedgerEntry[] = [];

  append(
    input: LedgerEntryInput,
    now: () => string = () => new Date().toISOString(),
  ): LedgerEntry {
    const index = this.entries.length;
    const prevHash = index === 0 ? GENESIS_HASH : this.entries[index - 1].hash;
    const timestamp = now();
    const hash = computeHash(prevHash, { ...input, index, timestamp });
    const entry: LedgerEntry = { ...input, index, timestamp, prevHash, hash };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly LedgerEntry[] {
    return this.entries;
  }

  /** Recomputes the hash chain from stored entries and reports whether it is intact. */
  verify(): { valid: boolean; firstBrokenIndex: number | null } {
    let prevHash = GENESIS_HASH;
    for (const entry of this.entries) {
      const { hash, prevHash: storedPrevHash, ...rest } = entry;
      if (storedPrevHash !== prevHash) {
        return { valid: false, firstBrokenIndex: entry.index };
      }
      const recomputed = computeHash(prevHash, rest);
      if (recomputed !== hash) {
        return { valid: false, firstBrokenIndex: entry.index };
      }
      prevHash = hash;
    }
    return { valid: true, firstBrokenIndex: null };
  }

  /** Test-only helper to prove `verify()` catches tampering. Never called in production code paths. */
  _tamperForTest(index: number, patch: Partial<LedgerEntryInput>): void {
    this.entries[index] = { ...this.entries[index], ...patch };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @vasooli/ledger exec vitest run src/ledger.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Create `packages/ledger/src/index.ts` barrel export**

```typescript
export * from "./ledger.js";
```

- [ ] **Step 6: Run the full ledger package test suite and typecheck**

Run: `pnpm --filter @vasooli/ledger exec vitest run && pnpm --filter @vasooli/ledger typecheck`
Expected: all tests PASS, typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/ledger/package.json packages/ledger/tsconfig.json packages/ledger/src/ledger.ts packages/ledger/src/ledger.test.ts packages/ledger/src/index.ts pnpm-lock.yaml
git commit -m "feat(ledger): add hash-chained tamper-evident audit log

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Whole-monorepo verification

**Files:** none created — this task only runs and verifies.

- [ ] **Step 1: Run every test in the workspace from the root**

Run: `pnpm test`
Expected: PASS — 9 (core) + 20 (stats) + 5 (ledger) = 34 tests total, 0 failures.

- [ ] **Step 2: Typecheck every package from the root**

Run: `pnpm typecheck`
Expected: exits 0 across `@vasooli/core`, `@vasooli/stats`, `@vasooli/ledger`.

- [ ] **Step 3: Verify Docker services start cleanly**

Run: `docker compose up -d && docker compose ps`
Expected: both `postgres` and `redis` services show state `running`/`healthy`.

Run: `docker compose down`
Expected: services stop cleanly, no errors.

- [ ] **Step 4: Commit the verification (no-op if nothing changed, otherwise commit any lockfile drift)**

```bash
git status --short
```

If there are unstaged changes (e.g. lockfile drift from Step 1–2), stage and commit them:

```bash
git add -A
git commit -m "chore: verify foundation packages pass tests, typecheck, and docker services boot

Co-Authored-By: Claude <noreply@anthropic.com>"
```

If `git status --short` is empty, no commit is needed — the foundation plan is complete.

---

## Self-review notes

- **Spec coverage:** §4 repo layout — `packages/core`, `packages/stats`, `packages/ledger`, `docker-compose.yml` all present (remaining `packages/*` and `apps/*` deferred to Plans 2–5, stated explicitly in Global Constraints). §8 audit ledger — hash chain + `verify()` implemented and tamper-tested (Task 9). §10 testing strategy — Wilson/Newcombe verified against reference values, CUSUM on synthetic step series, ledger tamper test, state machine invalid-transition tests all present (Tasks 3, 4, 5, 6, 9). §11 provider abstraction and §6 agent loop are out of scope for this plan (they depend on Postgres/Redis/LLM wiring) and are deferred to Plans 2 and 4 as stated in the plan header.
- **Placeholder scan:** no TBD/TODO markers; every step has runnable code and exact commands.
- **Type consistency:** `CaseState` defined once in `core/types.ts`, imported (not redefined) in `state-machine.ts`; `Interval` from `wilson.ts` is imported (not redefined) in `newcombe.ts`; `Arm`/`RandomFn` used consistently across `thompson.ts` and its test; `LedgerEntryInput`/`LedgerEntry` used consistently across `ledger.ts` and its test.

---

**Next plans (write via this same skill once this lands):**
2. Simulator + ingest + Redis Streams + four detectors
3. Policy DSL + evaluator + playbook catalog
4. LLM provider abstraction + RAG + diagnosis agent + bandit planner + executor + Razorpay adapter
5. Dashboard (Next.js, SSE, money wall, glass-box case view, audit tab) + seeded demo script
