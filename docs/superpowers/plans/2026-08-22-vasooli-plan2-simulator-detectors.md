# Vasooli Plan 2: Simulator & Detectors (Days 3–4)

> **Prerequisites:** Foundation complete (d8c761f), critical fixes complete (70d51fe).  
> **Scope:** Simulator service, event firehose, Redis Streams wiring, four deterministic detectors.  
> **Stack:** Node.js 22, pnpm workspaces, TypeScript strict, Zod, Docker Compose.

---

## Overview

**Goal:** Build a fault-injection simulator that feeds realistic events into the system; wire Redis Streams; and implement four **deterministic** detectors (no ML, no LLM) that emit `RiskSignal`s for payment failure, checkout abandonment, subscription failure, and B2B receivables aging.

**Principle:** All signals flow through Redis Streams (replayable consumer groups) → detector outputs → case ingestion. The simulator allows us to test the entire pipeline offline with reproducible degradation regimes (issuer downtime, failure spikes, abandonment surges, etc.).

---

## Deliverables

### 1. **packages/simulator** (new package)
Event generator with degradation injection:
- `SimulatorConfig`: regime definitions (failure rate spikes, abandonments, subscription failures, aging receivables)
- `EventGenerator`: seeded PRNG event stream emitting `Event` structs (payment, order, subscription, invoice)
- `degradationRegimes`: preset scenarios (e.g., "HDFC Visa down 14:00–16:00", "abandonment surge", "subscription retry storm")
- Zero external dependencies; runs fully offline

### 2. **packages/detector** (new package)
Four independent detectors, all deterministic (input → state → signal, no LLM):
- **PaymentDegradationDetector:** Rolling 7-day cohort success rate + CUSUM change-point detection; emits signal on drop vs. baseline
- **CheckoutAbandonmentDetector:** Order.created without payment.captured within TTL
- **SubscriptionFailureDetector:** Failed subscription.charged events, missed mandate dates, rate-limit hits
- **B2bReceivablesDetector:** Invoice aging (30/60/90+ days past due), DSO tracking

All detectors use hand-rolled stats (Wilson, CUSUM from packages/stats). No external ML.

### 3. **apps/engine** (Redis Streams integration)
- Fastify service wiring: `simulator → Redis Streams (revenue.events) → detector consumer → risk.signals`
- Consumer group setup, offset tracking, durable replay
- Health check and backpressure handling

### 4. **tests & fixtures**
- Scenario-driven tests (e.g., "inject 500 payment events with 15% issuer-down, detector emits 42 signals")
- Deterministic seeding for replay verification
- E2E test: simulator run → detectors → case ingest verifies count and signal correctness

---

## Implementation Tasks

### Task 1: Create `packages/simulator`

**Files to create:**
- `packages/simulator/package.json`
- `packages/simulator/src/config.ts` (regime definitions)
- `packages/simulator/src/event-generator.ts` (seeded event stream)
- `packages/simulator/src/degradation.ts` (apply regimes to base rates)
- `packages/simulator/src/index.ts` (barrel export)
- `packages/simulator/src/event-generator.test.ts` (determinism tests)

**Key exports:**
```typescript
export type Event = PaymentEvent | OrderEvent | SubscriptionEvent | InvoiceEvent;
export interface RegressionRegime { name: string; startTime: number; endTime: number; multiplier: number; /* ... */ }
export class EventGenerator { constructor(seed: number, baselineFailureRate: number); next(): Event; }
export const predefinedRegimes: Record<string, RegressionRegime[]>;
```

**Tests:**
- Seeded generator produces identical stream for same seed
- Degradation regimes reduce success rates by correct multiplier
- Event structure validates to expected schemas

### Task 2: Create `packages/detector`

**Files to create:**
- `packages/detector/package.json`
- `packages/detector/src/payment-degradation.ts` (CUSUM + rolling window)
- `packages/detector/src/checkout-abandonment.ts` (TTL-based)
- `packages/detector/src/subscription-failure.ts` (event pattern matching)
- `packages/detector/src/b2b-receivables.ts` (aging buckets)
- `packages/detector/src/detector-orchestrator.ts` (run all four)
- `packages/detector/src/index.ts`
- `packages/detector/src/*.test.ts`

**Key exports:**
```typescript
export interface RiskSignal { id: string; category: LeakageCategory; entityId: string; exposurePaise: bigint; evidence: Record<string, unknown>; }
export function detectPaymentDegradation(cohortStats: CohortStats): RiskSignal[];
export function detectCheckoutAbandonment(orders: Order[], nowMs: number, ttlMs: number): RiskSignal[];
export function detectSubscriptionFailure(subscriptions: Subscription[]): RiskSignal[];
export function detectB2bReceivables(invoices: Invoice[]): RiskSignal[];
export class DetectorOrchestrator { run(state: DetectorState): Promise<RiskSignal[]>; }
```

**Tests:**
- Payment degradation: 100-event window, CUSUM detects 20% drop at day 3
- Checkout abandonment: Orders without payment.captured past TTL emit signals
- Subscription: Failed debit + missed mandate dates emit signals
- B2B: Invoices 90+ days due emit signals with DSO computation

### Task 3: Wire Redis Streams in `apps/engine`

**Files to modify/create:**
- `apps/engine/src/queue.ts` (Redis Streams client, consumer groups)
- `apps/engine/src/detector-loop.ts` (consumer group listening on revenue.events, calling detectors)
- `apps/engine/src/index.ts` (Fastify setup with /publish, /health endpoints)

**Key operations:**
- `publishEvent(event: Event)` → XADD to `revenue.events`
- `runDetectorConsumer()` → XREAD from consumer group, call detectors, XADD to `risk.signals`
- Health check: ACK tracking, lag monitoring

**Tests:**
- Publish 10 events → consumer group reads all → signals produced → verify count

### Task 4: Docker Compose for local dev

**Files to create/update:**
- `docker-compose.yml`: Postgres, Redis services (update if not present)
- `Makefile` or `.env.example`: easy startup commands

**Health checks:**
- Postgres migrations auto-run on startup
- Redis ready for Streams operations
- Fastify health endpoint reports both backends healthy

### Task 5: E2E scenario test

**File:**
- `tests/integration/simulator-to-signals.test.ts`

**Test:**
```typescript
it("simulates 500 payment events with degradation, detector emits signals", async () => {
  const gen = new EventGenerator(42, 0.9);
  const regime = predefinedRegimes["HDFC_down_14_16"];
  
  const events: Event[] = [];
  for (let i = 0; i < 500; i++) {
    events.push(gen.next());
  }
  
  const signals = await orchestrator.run(events);
  expect(signals.length).toBeGreaterThan(40); // At least 40 payment-fail signals
  expect(signals.every(s => s.exposurePaise > 0n)).toBe(true);
});
```

---

## Self-Review Checklist

- [ ] Simulator runs fully offline, no network calls
- [ ] Detectors are deterministic: same input → same output
- [ ] All detectors Zod-validate outputs to RiskSignal schema
- [ ] Redis Streams consumer group is durable (ACK tracking, offset persistence)
- [ ] E2E test verifies seeded run produces consistent signal count
- [ ] All tests pass with `pnpm test`
- [ ] TypeScript strict mode: `pnpm typecheck`
- [ ] Docker Compose brings up both Postgres + Redis, migrations auto-apply

---

## Commits

After each task, commit with message pattern:

```
feat(simulator): add seeded event generator with degradation regimes

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Next: Plan 3

Once Plan 2 is verified (simulator runs offline, detectors emit signals, E2E passes), proceed to Plan 3: **Policy DSL & Evaluator** (Days 7–8).
