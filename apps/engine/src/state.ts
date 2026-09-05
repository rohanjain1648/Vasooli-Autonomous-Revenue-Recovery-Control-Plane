import { randomUUID } from "node:crypto";
import type { RecoveryCase, RiskSignal, LeakageCategory, PromiseToPay, PromiseChannel } from "@vasooli/core";
import { transitionPromise, transition, isTerminal } from "@vasooli/core";
import type { PolicyContext } from "@vasooli/policy";
import type { DiagnosisOutput, LlmProvider } from "@vasooli/llm";
import type { RazorpayClient } from "@vasooli/razorpay";
import type { PolicyEngine } from "@vasooli/policy";
import type { Arm } from "@vasooli/stats";
import { Ledger } from "@vasooli/ledger";
import type { LedgerEntry } from "@vasooli/ledger";
import {
  orchestrateCase,
  approveAndExecute,
  rejectApproval,
  assignArm,
  simulatedOutcome,
} from "@vasooli/orchestrator";
import type { OrchestratorDeps, PendingApproval } from "@vasooli/orchestrator";
import type { PlaybookCatalog, CatalogArm } from "./playbooks.js";
import { EngineEventBus } from "./event-bus.js";
import { computeMetricsSnapshot } from "./metrics.js";

export interface CaseRecord {
  case: RecoveryCase;
  signal: RiskSignal;
  diagnosis?: DiagnosisOutput;
  selectedArm?: string;
  policyDecision?: string;
  policyReason?: string;
  /** Present only while the case sits at awaiting_approval + NEEDS_APPROVAL. */
  pending?: PendingApproval;
}

export interface CircuitBreakerStatus {
  tripped: boolean;
  trippedAt?: number;
  trippedBy?: "auto" | "manual";
  reason?: string;
  pValue?: number;
  diff?: number;
}

export interface EngineConfig {
  llmProvider: LlmProvider;
  razorpayClient: RazorpayClient;
  policyEngine: PolicyEngine;
  catalog: PlaybookCatalog;
  rngSeed?: number;
  holdoutPercent?: number;
  /** Passed straight through to OrchestratorDeps.caseIdFactory — set by
   * the seeded demo script for a fully reproducible batch. */
  caseIdFactory?: () => string;
  /** How long before a promise's due date the RBI pre-debit notice goes
   * out, and how long after that the retry rule requires before it will
   * let the charge through — the same window on both ends of the wait.
   * Defaults to the real 24h. The live-server bootstraps override this
   * with a compressed value (and construct their policyEngine's
   * preDebitNotificationRule with the identical number) so the wait is
   * actually watchable in a live demo; nothing here enforces that the two
   * stay in sync, so read both call sites together before changing one. */
  promiseRetryNoticeMs?: number;
}

/**
 * Everything the dashboard reads and writes lives here: the case store, the
 * shared hash-chained ledger, per-category bandit posteriors, and the SSE
 * event bus. A single instance is created at boot and threaded through
 * every route — there is no database in this demo (offline-first, design
 * spec §11), so a process restart resets the world, same as the simulator.
 */
export class EngineState {
  readonly ledger = new Ledger();
  readonly bus = new EngineEventBus();
  readonly cases = new Map<string, CaseRecord>();
  readonly promises = new Map<string, PromiseToPay>();
  private readonly banditArms = new Map<LeakageCategory, Arm[]>();
  /** Contextual posteriors, keyed by `${category}:${evidenceCode}`. Each
   * bucket starts from the same flat prior as the category-level arms —
   * the bandit learns per root-cause once outcomes accumulate. */
  private readonly contextualBanditArms = new Map<string, Arm[]>();

  /** Global fuse: once tripped, every new signal is blocked before it ever
   * reaches diagnosis or the policy gate, and stays blocked until a human
   * resets it — a fuse that re-arms itself would defeat the point. See
   * `evaluateCircuitBreaker` for the always-valid statistical trigger and
   * `tripCircuitBreaker`/`resetCircuitBreaker` for the manual override the
   * dashboard exposes alongside it. */
  private breaker: CircuitBreakerStatus = { tripped: false };
  private static readonly BREAKER_MIN_TRIALS = 8;
  private static readonly BREAKER_P_THRESHOLD = 0.05;

  private static readonly DEFAULT_PROMISE_RETRY_NOTICE_MS = 24 * 60 * 60 * 1000;
  private readonly promiseRetryNoticeMs: number;
  /** Customers who made an explicit commitment (rather than receiving a
   * cold nudge) pay at a meaningfully higher rate — this is a documented
   * modeling assumption for the offline simulation, not a measured
   * figure; see TREATMENT_SUCCESS_RATE for the equivalent cold-nudge rate. */
  private static readonly PROMISE_RETRY_SUCCESS_RATE = 0.55;

  constructor(private readonly config: EngineConfig) {
    this.promiseRetryNoticeMs = config.promiseRetryNoticeMs ?? EngineState.DEFAULT_PROMISE_RETRY_NOTICE_MS;
  }

  private armsForCategory(category: LeakageCategory): Arm[] {
    let arms = this.banditArms.get(category);
    if (!arms) {
      const catalogArms = this.config.catalog.armsByCategory.get(category) ?? [];
      arms = catalogArms.map((a) => ({ id: a.id, alpha: 1, beta: 1 }));
      this.banditArms.set(category, arms);
    }
    return arms;
  }

  private contextualArms(category: LeakageCategory, evidenceCode: string): Arm[] {
    const key = `${category}:${evidenceCode}`;
    let arms = this.contextualBanditArms.get(key);
    if (!arms) {
      const catalogArms = this.config.catalog.armsByCategory.get(category) ?? [];
      arms = catalogArms.map((a) => ({ id: a.id, alpha: 1, beta: 1 }));
      this.contextualBanditArms.set(key, arms);
    }
    return arms;
  }

  private playbookArmsForCategory(category: LeakageCategory): CatalogArm[] {
    return this.config.catalog.armsByCategory.get(category) ?? [];
  }

  private deps(category: LeakageCategory, nowMs: number): OrchestratorDeps {
    return {
      llmProvider: this.config.llmProvider,
      razorpayClient: this.config.razorpayClient,
      ledger: this.ledger,
      policyEngine: this.config.policyEngine,
      playbookArms: this.playbookArmsForCategory(category),
      banditArms: this.armsForCategory(category),
      getBanditArms: (evidenceCode) => this.contextualArms(category, evidenceCode),
      rngSeed: this.config.rngSeed,
      holdoutPercent: this.config.holdoutPercent,
      caseIdFactory: this.config.caseIdFactory,
      nowMs,
    };
  }

  /** Feeds one detected risk signal through the full agent loop and
   * publishes every resulting ledger entry to SSE subscribers. */
  async ingestSignal(signal: RiskSignal, nowMs: number = Date.now()): Promise<CaseRecord> {
    if (this.breaker.tripped) {
      return this.blockedByBreaker(signal, nowMs);
    }

    const before = this.ledger.all().length;
    const deps = this.deps(signal.category, nowMs);
    const result = await orchestrateCase(signal, deps);

    const record: CaseRecord = {
      case: result.case,
      signal,
      diagnosis: result.diagnosis,
      selectedArm: result.selectedArm,
      policyDecision: result.policyDecision,
    };

    if (result.policyDecision === "NEEDS_APPROVAL" && result.selectedArm) {
      const arm = this.playbookArmsForCategory(signal.category).find(
        (a) => a.id === result.selectedArm,
      );
      if (arm) {
        record.pending = {
          case: result.case,
          signal,
          arm,
          selectedArm: result.selectedArm,
          evidenceCode: result.diagnosis?.evidenceCode,
        };
      }
    }

    this.cases.set(result.case.id, record);
    this.publishNewEntries(before);
    await this.processPromiseRetries(nowMs);
    this.sweepPromises(nowMs);

    if (record.pending) {
      this.bus.publish({
        type: "approval_pending",
        caseId: result.case.id,
        reason: "Action requires human sign-off",
      });
    }
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    this.evaluateCircuitBreaker();
    return record;
  }

  /**
   * The path a signal takes while the circuit breaker is tripped: logged
   * as detected, then stopped immediately, never touching diagnosis, the
   * bandit, the policy gate, or the executor. Distinguishing this from an
   * ordinary policy BLOCK matters for the audit trail — a reader should be
   * able to tell "the policy gate blocked this one case" from "nothing was
   * even evaluated, the whole system was down" at a glance.
   */
  private blockedByBreaker(signal: RiskSignal, nowMs: number): CaseRecord {
    const caseId = randomUUID();
    const nowIso = new Date(nowMs).toISOString();
    const armGroup = assignArm(caseId, this.config.holdoutPercent ?? 20);
    let recoveryCase: RecoveryCase = {
      id: caseId,
      signalId: signal.id,
      category: signal.category,
      state: "detected",
      armGroup,
      exposurePaise: signal.exposurePaise,
      recoveredPaise: 0n,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.ledger.append({
      actor: "orchestrator",
      caseId,
      action: "detected",
      payload: { signalId: signal.id, category: signal.category, armGroup },
    });
    recoveryCase = { ...recoveryCase, state: transition("detected", "stopped"), updatedAt: nowIso };
    this.ledger.append({
      actor: "policy",
      caseId,
      action: "stopped",
      payload: { reason: `Circuit breaker tripped: ${this.breaker.reason ?? "manual stop"}` },
    });

    const record: CaseRecord = { case: recoveryCase, signal };
    this.cases.set(caseId, record);
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    return record;
  }

  /**
   * Trips the global fuse: `by: "auto"` for the statistical trigger below,
   * `"manual"` for the dashboard's own STOP button. Idempotent — tripping
   * an already-tripped breaker is a no-op, so a manual press during an
   * auto-trip can't overwrite the more informative auto reason.
   */
  tripCircuitBreaker(by: "auto" | "manual", reason: string, pValue?: number, diff?: number): void {
    if (this.breaker.tripped) return;
    this.breaker = { tripped: true, trippedAt: Date.now(), trippedBy: by, reason, pValue, diff };
    this.ledger.append({
      actor: by === "auto" ? "monitor" : "human",
      caseId: "GLOBAL",
      action: "circuit_breaker_tripped",
      payload: { reason, trippedBy: by, pValue: pValue ?? null, diff: diff ?? null },
    });
    this.bus.publish({ type: "circuit_breaker_tripped", reason, trippedBy: by });
  }

  /** Human-only reset — the fuse never re-arms itself. */
  resetCircuitBreaker(): { ok: boolean } {
    if (!this.breaker.tripped) return { ok: false };
    this.breaker = { tripped: false };
    this.ledger.append({ actor: "human", caseId: "GLOBAL", action: "circuit_breaker_reset", payload: {} });
    this.bus.publish({ type: "circuit_breaker_reset" });
    return { ok: true };
  }

  circuitBreakerStatus(): CircuitBreakerStatus {
    return this.breaker;
  }

  /**
   * The self-shutdown half of the fuse: after every metrics change, checks
   * whether treatment recovery has fallen *significantly below* holdout —
   * the agent's own interventions doing worse than doing nothing — using
   * the same always-valid mSPRT test the money wall's headline p-value
   * comes from (design spec §5, "no peeking problem"), so this is safe to
   * re-check after every single case rather than only at fixed intervals.
   * Requires a minimum sample in both cohorts first, so an early run of
   * bad luck on n=2 can't trip it.
   */
  private evaluateCircuitBreaker(): void {
    if (this.breaker.tripped) return;
    const snapshot = computeMetricsSnapshot(this);
    const t = snapshot.treatment;
    const h = snapshot.holdout;
    if (t.n < EngineState.BREAKER_MIN_TRIALS || h.n < EngineState.BREAKER_MIN_TRIALS) return;
    if (snapshot.pValue < EngineState.BREAKER_P_THRESHOLD && snapshot.upliftRateDiff < 0) {
      const reason =
        `Treatment recovery (${(t.successRate * 100).toFixed(1)}%, n=${t.n}) is significantly ` +
        `below holdout (${(h.successRate * 100).toFixed(1)}%, n=${h.n}) — p=${snapshot.pValue.toFixed(4)}`;
      this.tripCircuitBreaker("auto", reason, snapshot.pValue, snapshot.upliftRateDiff);
    }
  }

  async approve(caseId: string): Promise<CaseRecord | null> {
    const record = this.cases.get(caseId);
    if (!record?.pending) return null;
    const before = this.ledger.all().length;
    const deps = this.deps(record.signal.category, Date.now());
    const result = await approveAndExecute(record.pending, deps);
    const updated: CaseRecord = { ...record, case: result.case, pending: undefined };
    this.cases.set(caseId, updated);
    this.publishNewEntries(before);
    await this.processPromiseRetries();
    this.sweepPromises();
    this.bus.publish({ type: "approval_resolved", caseId, decision: "approved" });
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    this.evaluateCircuitBreaker();
    return updated;
  }

  reject(caseId: string): CaseRecord | null {
    const record = this.cases.get(caseId);
    if (!record?.pending) return null;
    const before = this.ledger.all().length;
    const deps = this.deps(record.signal.category, Date.now());
    const result = rejectApproval(record.pending, deps);
    const updated: CaseRecord = { ...record, case: result.case, pending: undefined };
    this.cases.set(caseId, updated);
    this.publishNewEntries(before);
    this.bus.publish({ type: "approval_resolved", caseId, decision: "rejected" });
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
    return updated;
  }

  /**
   * Records a customer's commitment to pay — captured by a human, the
   * scripted IVR, or the live voice agent. Advisory only: it never moves
   * money and never bypasses the policy gate; the underlying case keeps
   * running exactly as it would have. Returns null if the case doesn't
   * exist (the route maps that to 404).
   */
  recordPromise(input: {
    caseId: string;
    promisedAmountPaise: bigint;
    promisedForMs: number;
    channel: PromiseChannel;
    note?: string;
    actor?: string;
    nowMs?: number;
  }): PromiseToPay | null {
    const record = this.cases.get(input.caseId);
    if (!record) return null;

    const nowMs = input.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const promise: PromiseToPay = {
      id: randomUUID(),
      caseId: input.caseId,
      promisedAmountPaise: input.promisedAmountPaise,
      promisedForMs: input.promisedForMs,
      channel: input.channel,
      state: "promised",
      note: input.note,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.promises.set(promise.id, promise);

    this.ledger.append({
      actor: input.actor ?? "human",
      caseId: input.caseId,
      action: "promise_recorded",
      payload: {
        promiseId: promise.id,
        promisedAmountPaise: promise.promisedAmountPaise.toString(),
        promisedForMs: promise.promisedForMs,
        channel: promise.channel,
        note: promise.note ?? null,
      },
    });

    this.bus.publish({
      type: "promise_recorded",
      caseId: input.caseId,
      promiseId: promise.id,
      channel: promise.channel,
    });
    return promise;
  }

  /**
   * Resolves every open promise against its case's actual outcome —
   * "honored" means the money showed up, not that the customer sounded
   * sincere. Cheap and idempotent, so it's safe to call on every tick
   * (see SignalFeed) as well as on demand.
   */
  sweepPromises(nowMs: number = Date.now(), graceMs = 24 * 60 * 60 * 1000): void {
    for (const promise of this.promises.values()) {
      if (promise.state === "honored" || promise.state === "broken") continue;

      const record = this.cases.get(promise.caseId);
      if (!record) continue;
      const { state: caseState, recoveredPaise } = record.case;

      let nextState: "honored" | "broken" | "partial" | null = null;
      if (recoveredPaise >= promise.promisedAmountPaise) {
        nextState = "honored";
      } else if (caseState === "failed" || caseState === "stopped") {
        // The underlying case is done and never recovered — the promise
        // cannot still come true through this case.
        nextState = "broken";
      } else if (recoveredPaise > 0n) {
        nextState = "partial";
      } else if (nowMs > promise.promisedForMs + graceMs) {
        nextState = "broken";
      }

      if (!nextState || nextState === promise.state) continue;
      const resolved: PromiseToPay = {
        ...promise,
        state: transitionPromise(promise.state, nextState),
        updatedAt: new Date(nowMs).toISOString(),
      };
      this.promises.set(promise.id, resolved);

      if (nextState === "honored" || nextState === "broken") {
        this.ledger.append({
          actor: "orchestrator",
          caseId: promise.caseId,
          action: `promise_${nextState}`,
          payload: { promiseId: promise.id },
        });
        this.bus.publish({
          type: "promise_resolved",
          caseId: promise.caseId,
          promiseId: promise.id,
          state: nextState,
        });
      }
    }
  }

  /**
   * Closes the promise loop: "she said Tuesday" needs to actually become
   * a scheduled charge attempt on Tuesday, gated by RBI's pre-debit
   * notice — otherwise a Promise-to-Pay is just a note nobody acts on.
   * Runs both halves for every open promise: send the notice once its
   * lead window opens, then attempt the retry once the promised date
   * arrives *and* the policy gate (preDebitNotificationRule, where wired
   * in) actually clears it. Idempotent and safe on every tick alongside
   * sweepPromises, which should run after this so a same-tick retry
   * success is reflected in the honored/broken check immediately.
   */
  async processPromiseRetries(nowMs: number = Date.now()): Promise<void> {
    for (const promise of [...this.promises.values()]) {
      if (promise.state !== "promised" && promise.state !== "partial") continue;
      const record = this.cases.get(promise.caseId);
      // No intervention is ever attempted on the holdout counterfactual —
      // a promise recorded against one only ever resolves organically, via
      // sweepPromises watching the case's own (untouched) outcome. Nor on
      // a case still genuinely awaiting a human's sign-off: sending an
      // RBI pre-debit notice would misrepresent a charge as scheduled
      // when it cannot happen without that approval first.
      if (!record || record.case.armGroup === "holdout" || record.pending) continue;

      await this.sendPreDebitNoticeIfDue(promise, nowMs);
      const current = this.promises.get(promise.id);
      if (current) await this.runPromiseRetryIfDue(current, nowMs);
    }
  }

  /** Sends the RBI pre-debit notice once nowMs enters the lead window
   * before the promised date. A promise made with less runway than the
   * notice window (e.g. "I'll pay tomorrow") still gets notified
   * immediately — compliance takes priority over hitting the promised
   * date exactly; the retry rule below simply defers the charge until the
   * full window has actually elapsed since this notice. */
  private async sendPreDebitNoticeIfDue(promise: PromiseToPay, nowMs: number): Promise<void> {
    if (promise.notifiedAt) return;
    const dueForNoticeAtMs = promise.promisedForMs - this.promiseRetryNoticeMs;
    if (nowMs < dueForNoticeAtMs) return;

    const record = this.cases.get(promise.caseId);
    if (!record) return;
    const rupees = (Number(promise.promisedAmountPaise) / 100).toFixed(2);
    const dueDate = new Date(promise.promisedForMs).toLocaleDateString("en-IN");
    await this.config.razorpayClient.sendNotification(
      record.signal.entityId,
      "sms",
      `This is a notice that a payment of ₹${rupees} will be attempted on ${dueDate}, as per your commitment.`,
    );

    const notified: PromiseToPay = { ...promise, notifiedAt: new Date(nowMs).toISOString() };
    this.promises.set(promise.id, notified);
    this.ledger.append({
      actor: "executor",
      caseId: promise.caseId,
      action: "pre_debit_notice_sent",
      payload: { promiseId: promise.id, chargeDueAtMs: promise.promisedForMs },
    });
    this.bus.publish({ type: "promise_notice_sent", caseId: promise.caseId, promiseId: promise.id });
  }

  /** Attempts the promise-driven retry once its due date arrives, gated by
   * the same deterministic policy engine every other action goes through
   * — nothing here bypasses the gate just because the customer already
   * promised. Only acts on a case sitting in `deferred` (blocked purely by
   * TRAI quiet-hours timing — a nudge forward is fine) or `executing`
   * (defensive; the executor never actually leaves a case resting there
   * between ticks). Deliberately excludes `awaiting_approval`: that state
   * means a human sign-off was explicitly required, which is a stronger,
   * separate control than a scheduled retry and must never be silently
   * bypassed just because a due date arrived — see the `record.pending`
   * guard below, which is what actually enforces that. */
  private async runPromiseRetryIfDue(promise: PromiseToPay, nowMs: number): Promise<void> {
    if (promise.retryAttemptedAt) return;
    if (nowMs < promise.promisedForMs) return;
    const record = this.cases.get(promise.caseId);
    if (!record) return;
    if (record.pending) return; // a human sign-off is required — never bypassed by a promise's due date
    const { case: c } = record;
    if (isTerminal(c.state)) return; // already resolved or halted — sweepPromises handles it
    if (c.state !== "deferred" && c.state !== "executing") return;

    const context: PolicyContext = {
      case: c,
      nowMs,
      recentTouches: 0,
      estimatedRecoverablePaise: promise.promisedAmountPaise,
      actionCostPaise: 0n,
      isHighRiskAction: false,
      isPromiseRetry: true,
      preDebitNoticeSentAtMs: promise.notifiedAt ? new Date(promise.notifiedAt).getTime() : undefined,
    };
    const evaluation = this.config.policyEngine.evaluate(context);
    this.ledger.append({
      actor: "policy",
      caseId: c.id,
      action: "promise_retry_evaluated",
      payload: { promiseId: promise.id, finalDecision: evaluation.finalDecision, finalReason: evaluation.finalReason },
    });
    if (evaluation.finalDecision !== "PASS") return; // stays "promised"; re-evaluated next tick

    let updatedCase = c;
    if (updatedCase.state === "deferred") {
      updatedCase = { ...updatedCase, state: transition("deferred", "awaiting_approval") };
    }
    if (updatedCase.state === "awaiting_approval") {
      updatedCase = { ...updatedCase, state: transition("awaiting_approval", "executing") };
    }

    const success = simulatedOutcome(`${c.id}:promise:${promise.id}`, EngineState.PROMISE_RETRY_SUCCESS_RATE);
    updatedCase = {
      ...updatedCase,
      state: transition("executing", success ? "recovered" : "failed"),
      recoveredPaise: success
        ? (updatedCase.recoveredPaise > promise.promisedAmountPaise ? updatedCase.recoveredPaise : promise.promisedAmountPaise)
        : updatedCase.recoveredPaise,
      updatedAt: new Date(nowMs).toISOString(),
    };
    this.ledger.append({
      actor: "executor",
      caseId: c.id,
      action: "promise_retry_executed",
      payload: { promiseId: promise.id, success, recoveredPaise: updatedCase.recoveredPaise.toString() },
    });
    this.ledger.append({
      actor: "orchestrator",
      caseId: c.id,
      action: updatedCase.state,
      payload: { recoveredPaise: updatedCase.recoveredPaise.toString(), viaPromiseRetry: true },
    });

    this.cases.set(c.id, { ...record, case: updatedCase });
    this.promises.set(promise.id, { ...promise, retryAttemptedAt: new Date(nowMs).toISOString() });
    this.bus.publish({
      type: "case_transition",
      caseId: c.id,
      state: updatedCase.state,
      action: updatedCase.state,
      payload: { viaPromiseRetry: true },
    });
    this.bus.publish({ type: "metrics_update", metrics: computeMetricsSnapshot(this) });
  }

  listPromises(filter: { state?: string; caseId?: string } = {}): PromiseToPay[] {
    let all = [...this.promises.values()];
    if (filter.state) all = all.filter((p) => p.state === filter.state);
    if (filter.caseId) all = all.filter((p) => p.caseId === filter.caseId);
    all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return all;
  }

  /** Honor rate across every resolved promise, plus the raw counts a
   * dashboard needs to render its own breakdown. Pending promises (still
   * "promised"/"partial") are excluded from the rate — they haven't
   * resolved one way or the other yet. */
  promisesSummary() {
    const all = [...this.promises.values()];
    const honored = all.filter((p) => p.state === "honored").length;
    const broken = all.filter((p) => p.state === "broken").length;
    const partial = all.filter((p) => p.state === "partial").length;
    const pending = all.filter((p) => p.state === "promised").length;
    const resolved = honored + broken;
    return {
      total: all.length,
      pending,
      partial,
      honored,
      broken,
      honorRate: resolved > 0 ? honored / resolved : null,
    };
  }

  private publishNewEntries(sinceIndex: number): void {
    const all = this.ledger.all();
    for (let i = sinceIndex; i < all.length; i++) {
      const entry = all[i];
      if (entry.action === "detected") {
        const payload = entry.payload as { category?: string; armGroup?: string };
        this.bus.publish({
          type: "case_detected",
          caseId: entry.caseId,
          category: String(payload.category ?? ""),
          armGroup: String(payload.armGroup ?? ""),
        });
      } else {
        const record = this.cases.get(entry.caseId);
        this.bus.publish({
          type: "case_transition",
          caseId: entry.caseId,
          state: record?.case.state ?? entry.action,
          action: entry.action,
          payload: entry.payload,
        });
      }
    }
  }

  listCases(filter: { state?: string; category?: string; limit?: number } = {}): CaseRecord[] {
    let all = [...this.cases.values()];
    if (filter.state) all = all.filter((r) => r.case.state === filter.state);
    if (filter.category) all = all.filter((r) => r.case.category === filter.category);
    all.sort((a, b) => (a.case.updatedAt < b.case.updatedAt ? 1 : -1));
    return filter.limit ? all.slice(0, filter.limit) : all;
  }

  getCase(id: string): CaseRecord | undefined {
    return this.cases.get(id);
  }

  caseTransitions(id: string): LedgerEntry[] {
    return this.ledger.all().filter((e) => e.caseId === id);
  }

  listApprovals(): CaseRecord[] {
    return [...this.cases.values()].filter((r) => r.pending !== undefined);
  }

  auditLog(verify: boolean): { entries: LedgerEntry[]; valid?: boolean; firstBrokenIndex?: number | null } {
    const entries = [...this.ledger.all()];
    if (!verify) return { entries };
    const result = this.ledger.verify();
    return { entries, valid: result.valid, firstBrokenIndex: result.firstBrokenIndex };
  }

  /**
   * Demo control for the audit page's "break an entry" button: corrupts a
   * random past entry (or a specific one, if given) so a viewer can watch
   * the browser's own hash re-computation catch it live, rather than
   * taking tamper-evidence on faith. Never called from any real
   * orchestration path — see Ledger.demoTamper's own doc comment.
   */
  tamperLedgerForDemo(index?: number): { ok: true; index: number } | { ok: false; reason: string } {
    const all = this.ledger.all();
    if (all.length === 0) return { ok: false, reason: "ledger is empty — nothing to tamper" };
    const target = index ?? Math.floor(Math.random() * all.length);
    const result = this.ledger.demoTamper(target);
    return result.ok ? { ok: true, index: target } : result;
  }

  restoreLedgerForDemo(): { ok: boolean } {
    return this.ledger.demoRestore();
  }

  ledgerDemoTamperedIndex(): number | null {
    return this.ledger.demoTamperedIndex();
  }

  /** Cohort breakdown per category+arm-group for the experiments page. */
  experimentsSnapshot() {
    const byCategory = new Map<
      LeakageCategory,
      { treatment: CaseRecord[]; holdout: CaseRecord[] }
    >();
    for (const record of this.cases.values()) {
      const bucket = byCategory.get(record.case.category) ?? { treatment: [], holdout: [] };
      if (record.case.armGroup === "treatment") bucket.treatment.push(record);
      else bucket.holdout.push(record);
      byCategory.set(record.case.category, bucket);
    }

    return [...byCategory.entries()].map(([category, { treatment, holdout }]) => ({
      category,
      treatment: cohortStats(treatment),
      holdout: cohortStats(holdout),
    }));
  }

  metricsSnapshot() {
    const all = [...this.cases.values()];
    const treatment = all.filter((r) => r.case.armGroup === "treatment");
    const holdout = all.filter((r) => r.case.armGroup === "holdout");
    const tStats = cohortStats(treatment);
    const hStats = cohortStats(holdout);

    const detected = all.length;
    const recovered = all.filter((r) => r.case.state === "recovered").length;
    const blocked = all.filter((r) => r.case.state === "stopped").length;
    const deferred = all.filter((r) => r.case.state === "deferred").length;
    const grossPaise = all.reduce((sum, r) => sum + r.case.recoveredPaise, 0n);

    return {
      detected,
      recovered,
      blocked,
      deferred,
      grossPaise: grossPaise.toString(),
      treatment: tStats,
      holdout: hStats,
    };
  }
}

function cohortStats(records: CaseRecord[]) {
  const resolved = records.filter((r) => r.case.state === "recovered" || r.case.state === "failed");
  const successes = resolved.filter((r) => r.case.state === "recovered").length;
  const recoveredPaise = resolved.reduce((sum, r) => sum + r.case.recoveredPaise, 0n);
  return {
    n: resolved.length,
    inFlight: records.length - resolved.length,
    successes,
    successRate: resolved.length > 0 ? successes / resolved.length : 0,
    recoveredPaise: recoveredPaise.toString(),
  };
}
