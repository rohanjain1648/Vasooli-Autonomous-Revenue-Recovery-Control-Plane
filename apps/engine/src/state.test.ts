import { describe, it, expect } from "vitest";
import type { RecoveryCase } from "@vasooli/core";
import { PolicyEngine, defaultRules, preDebitNotificationRule } from "@vasooli/policy";
import { MockLlmProvider } from "@vasooli/llm";
import { FakeRazorpayClient } from "@vasooli/razorpay";
import { EngineState } from "./state.js";
import type { CaseRecord } from "./state.js";
import { buildTestState, makeTestSignal, fakeCatalog, DAYTIME_MS } from "./test-helpers.js";
import { computeMetricsSnapshot } from "./metrics.js";

describe("EngineState.ingestSignal", () => {
  it("resolves a PASS case to recovered/failed and records the ledger chain", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    expect(record.policyDecision).toBe("PASS");
    expect(["recovered", "failed"]).toContain(record.case.state);
    expect(state.getCase(record.case.id)).toBeDefined();
    expect(state.auditLog(true).valid).toBe(true);
  });

  it("stores a pending approval for a NEEDS_APPROVAL case and surfaces it in listApprovals", async () => {
    const state = buildTestState({
      payment_failure: { requiresApproval: true },
    });
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    expect(record.policyDecision).toBe("NEEDS_APPROVAL");
    expect(record.case.state).toBe("awaiting_approval");
    expect(state.listApprovals().map((r) => r.case.id)).toContain(record.case.id);
  });

  it("approve() executes and clears the pending approval", async () => {
    const state = buildTestState({ payment_failure: { requiresApproval: true } });
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    const updated = await state.approve(record.case.id);

    expect(updated).not.toBeNull();
    expect(["recovered", "failed"]).toContain(updated!.case.state);
    expect(state.listApprovals()).toHaveLength(0);
  });

  it("reject() stops the case without executing", async () => {
    const state = buildTestState({ payment_failure: { requiresApproval: true } });
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    const updated = state.reject(record.case.id);

    expect(updated).not.toBeNull();
    expect(updated!.case.state).toBe("stopped");
    expect(state.listApprovals()).toHaveLength(0);
  });

  it("approve()/reject() return null for a case with no pending approval", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    expect(await state.approve(record.case.id)).toBeNull();
    expect(state.reject(record.case.id)).toBeNull();
    await expect(state.approve("does-not-exist")).resolves.toBeNull();
  });

  it("routes a holdout case straight to recovered/failed with no approval possible", async () => {
    const holdoutState = buildTestState({}, 100);
    const record = await holdoutState.ingestSignal(makeTestSignal(), DAYTIME_MS);

    expect(record.case.armGroup).toBe("holdout");
    expect(["recovered", "failed"]).toContain(record.case.state);
    expect(record.diagnosis).toBeUndefined();
  });

  it("listCases filters by state and category", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal({ category: "payment_failure" }), DAYTIME_MS);
    await state.ingestSignal(makeTestSignal({ category: "b2b_receivable" }), DAYTIME_MS);

    expect(state.listCases({ category: "b2b_receivable" })).toHaveLength(1);
    expect(state.listCases({ category: "payment_failure" })).toHaveLength(1);
  });

  it("metricsSnapshot and computeMetricsSnapshot reflect resolved cases", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    const snapshot = computeMetricsSnapshot(state);

    expect(snapshot.detected).toBe(1);
    expect(typeof snapshot.pValue).toBe("number");
    expect(typeof snapshot.incrementalPaise).toBe("string");
  });
});

describe("Promise-to-Pay", () => {
  it("recordPromise returns null for a case that doesn't exist", () => {
    const state = buildTestState();
    expect(
      state.recordPromise({
        caseId: "does-not-exist",
        promisedAmountPaise: 100n,
        promisedForMs: DAYTIME_MS,
        channel: "manual",
      }),
    ).toBeNull();
  });

  it("recordPromise creates a promise, appends a ledger entry, and surfaces it in listPromises", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    const promise = state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: DAYTIME_MS + 86_400_000,
      channel: "voice",
      note: "Said they'd pay Friday.",
      nowMs: DAYTIME_MS,
    });

    expect(promise).not.toBeNull();
    expect(promise!.state).toBe("promised");
    expect(state.listPromises({ caseId: record.case.id })).toHaveLength(1);
    const actions = state.auditLog(false).entries.map((e) => e.action);
    expect(actions).toContain("promise_recorded");
    expect(state.auditLog(true).valid).toBe(true);
  });

  it("sweepPromises honors a promise once its case has recovered enough to cover it", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    // Force the outcome deterministically rather than depend on the
    // bandit's simulated coin flip.
    state.cases.set(record.case.id, {
      ...record,
      case: { ...record.case, state: "recovered", recoveredPaise: 500_00n },
    });
    const promise = state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: DAYTIME_MS + 1000,
      channel: "manual",
      nowMs: DAYTIME_MS,
    })!;

    state.sweepPromises(DAYTIME_MS + 500);

    expect(state.listPromises({ caseId: record.case.id })[0].state).toBe("honored");
    expect(state.auditLog(false).entries.map((e) => e.action)).toContain("promise_honored");
  });

  it("sweepPromises breaks a promise once the case has failed", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(record.case.id, {
      ...record,
      case: { ...record.case, state: "failed", recoveredPaise: 0n },
    });
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: DAYTIME_MS + 86_400_000,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    state.sweepPromises(DAYTIME_MS + 1000); // long before the promised date

    expect(state.listPromises({ caseId: record.case.id })[0].state).toBe("broken");
  });

  it("sweepPromises breaks a promise once its due date plus grace has passed with no recovery", async () => {
    const state = buildTestState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(record.case.id, {
      ...record,
      case: { ...record.case, state: "awaiting_approval", recoveredPaise: 0n },
    });
    const dueMs = DAYTIME_MS + 60_000;
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    state.sweepPromises(dueMs + 1_000, 10_000); // past due, but still inside grace
    expect(state.listPromises({ caseId: record.case.id })[0].state).toBe("promised");

    state.sweepPromises(dueMs + 20_000, 10_000); // past due + grace
    expect(state.listPromises({ caseId: record.case.id })[0].state).toBe("broken");
  });

  it("promisesSummary counts each bucket and computes the honor rate over resolved promises only", async () => {
    const state = buildTestState();
    const recovered = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    const failed = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(recovered.case.id, {
      ...recovered,
      case: { ...recovered.case, state: "recovered", recoveredPaise: 500_00n },
    });
    state.cases.set(failed.case.id, {
      ...failed,
      case: { ...failed.case, state: "failed", recoveredPaise: 0n },
    });
    state.recordPromise({
      caseId: recovered.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: DAYTIME_MS + 1000,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });
    state.recordPromise({
      caseId: failed.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: DAYTIME_MS + 86_400_000,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });
    state.sweepPromises(DAYTIME_MS + 500);

    const summary = state.promisesSummary();
    expect(summary.total).toBe(2);
    expect(summary.honored).toBe(1);
    expect(summary.broken).toBe(1);
    expect(summary.pending).toBe(0);
    expect(summary.honorRate).toBe(0.5);
  });
});

describe("Audit ledger demo tamper/restore", () => {
  it("tamperLedgerForDemo breaks the chain, restoreLedgerForDemo fixes it", async () => {
    const state = buildTestState();
    await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    await state.ingestSignal(makeTestSignal(), DAYTIME_MS);

    expect(state.auditLog(true).valid).toBe(true);

    const result = state.tamperLedgerForDemo(0);
    expect(result.ok).toBe(true);
    expect(state.auditLog(true).valid).toBe(false);
    expect(state.ledgerDemoTamperedIndex()).toBe(0);

    const restored = state.restoreLedgerForDemo();
    expect(restored.ok).toBe(true);
    expect(state.auditLog(true).valid).toBe(true);
    expect(state.ledgerDemoTamperedIndex()).toBeNull();
  });

  it("refuses to tamper an empty ledger", () => {
    const state = buildTestState();
    expect(state.tamperLedgerForDemo().ok).toBe(false);
  });
});

describe("Circuit breaker", () => {
  /** Injects a resolved case directly into the map, bypassing orchestration —
   * mirrors the pattern the Promise-to-Pay tests above use to force a
   * deterministic outcome instead of depending on the bandit's coin flip. */
  function injectResolvedCase(
    state: ReturnType<typeof buildTestState>,
    armGroup: "treatment" | "holdout",
    outcome: "recovered" | "failed",
    idSuffix: string,
  ): void {
    const signal = makeTestSignal({ id: `signal-${idSuffix}` });
    const record: CaseRecord = {
      case: {
        id: `case-${idSuffix}`,
        signalId: signal.id,
        category: signal.category,
        state: outcome,
        armGroup,
        exposurePaise: signal.exposurePaise,
        recoveredPaise: outcome === "recovered" ? signal.exposurePaise : 0n,
        createdAt: new Date(DAYTIME_MS).toISOString(),
        updatedAt: new Date(DAYTIME_MS).toISOString(),
      } satisfies RecoveryCase,
      signal,
    };
    state.cases.set(record.case.id, record);
  }

  it("starts untripped", () => {
    const state = buildTestState();
    expect(state.circuitBreakerStatus().tripped).toBe(false);
  });

  it("manual trip blocks every subsequent signal before diagnosis, and stays tripped", async () => {
    const state = buildTestState();
    state.tripCircuitBreaker("manual", "test stop");
    expect(state.circuitBreakerStatus().tripped).toBe(true);

    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    expect(record.case.state).toBe("stopped");
    expect(record.diagnosis).toBeUndefined();
    expect(record.selectedArm).toBeUndefined();

    const actions = state
      .auditLog(false)
      .entries.filter((e) => e.caseId === record.case.id)
      .map((e) => e.action);
    expect(actions).toEqual(["detected", "stopped"]);
  });

  it("a second manual trip while already tripped does not overwrite the reason", () => {
    const state = buildTestState();
    state.tripCircuitBreaker("manual", "first reason");
    state.tripCircuitBreaker("manual", "second reason");
    expect(state.circuitBreakerStatus().reason).toBe("first reason");
  });

  it("resetCircuitBreaker resumes normal processing", async () => {
    const state = buildTestState();
    state.tripCircuitBreaker("manual", "test stop");
    expect(state.resetCircuitBreaker().ok).toBe(true);
    expect(state.circuitBreakerStatus().tripped).toBe(false);

    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    expect(record.policyDecision).toBe("PASS");
  });

  it("resetCircuitBreaker on an untripped breaker is a no-op", () => {
    const state = buildTestState();
    expect(state.resetCircuitBreaker().ok).toBe(false);
  });

  it("auto-trips when treatment recovery is significantly below holdout with enough trials in both cohorts", async () => {
    const state = buildTestState();
    // 20 treatment cases, all failed; 20 holdout cases, all recovered — an
    // unambiguous reversal. The always-valid test needs more than just
    // BREAKER_MIN_TRIALS worth of samples to actually clear p<0.05 (mSPRT
    // trades early power for never inflating false positives — see
    // packages/stats/src/msprt.test.ts), so this uses a wider margin than
    // the bare minimum the breaker requires.
    for (let i = 0; i < 20; i++) {
      injectResolvedCase(state, "treatment", "failed", `t${i}`);
      injectResolvedCase(state, "holdout", "recovered", `h${i}`);
    }
    expect(state.circuitBreakerStatus().tripped).toBe(false);

    // Any ingest re-evaluates the breaker at the end.
    await state.ingestSignal(makeTestSignal({ id: "trigger" }), DAYTIME_MS);

    const status = state.circuitBreakerStatus();
    expect(status.tripped).toBe(true);
    expect(status.trippedBy).toBe("auto");
    expect(status.diff).toBeLessThan(0);

    // The very next signal is blocked by the now-tripped breaker.
    const blocked = await state.ingestSignal(makeTestSignal({ id: "after-trip" }), DAYTIME_MS);
    expect(blocked.case.state).toBe("stopped");
  });

  it("does not trip on too few trials even with a bad-looking early split", async () => {
    const state = buildTestState();
    injectResolvedCase(state, "treatment", "failed", "t0");
    injectResolvedCase(state, "holdout", "recovered", "h0");

    await state.ingestSignal(makeTestSignal({ id: "trigger" }), DAYTIME_MS);
    expect(state.circuitBreakerStatus().tripped).toBe(false);
  });
});

describe("Closing the promise loop (RBI-aware retry)", () => {
  const NOTICE_MS = 1000;

  /** A state whose policy engine actually gates promise retries on the
   * RBI notice window, wired the same way the live-server bootstraps do. */
  function buildGatedState(): EngineState {
    return new EngineState({
      llmProvider: new MockLlmProvider(),
      razorpayClient: new FakeRazorpayClient(),
      policyEngine: new PolicyEngine([...defaultRules(), preDebitNotificationRule(NOTICE_MS)]),
      catalog: fakeCatalog(),
      rngSeed: 1,
      holdoutPercent: 0,
      promiseRetryNoticeMs: NOTICE_MS,
    });
  }

  it("sends the pre-debit notice once the notice window opens, before the retry is allowed to fire", async () => {
    const state = buildGatedState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(record.case.id, { ...record, case: { ...record.case, state: "deferred" } });

    const dueMs = DAYTIME_MS + 500;
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    // The notice window (1000ms) is wider than the gap to the due date
    // (500ms), so the notice should already be due at DAYTIME_MS.
    await state.processPromiseRetries(DAYTIME_MS);

    const notified = state.listPromises({ caseId: record.case.id })[0];
    expect(notified.notifiedAt).toBeDefined();
    expect(notified.retryAttemptedAt).toBeUndefined();
    expect(state.getCase(record.case.id)!.case.state).toBe("deferred"); // untouched — too early to charge
    expect(state.auditLog(false).entries.map((e) => e.action)).toContain("pre_debit_notice_sent");
  });

  it("does not execute the retry until the full notice window has actually elapsed", async () => {
    const state = buildGatedState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(record.case.id, { ...record, case: { ...record.case, state: "deferred" } });

    const dueMs = DAYTIME_MS + 500;
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    await state.processPromiseRetries(dueMs); // notice sent here, at the due date itself
    await state.processPromiseRetries(dueMs + NOTICE_MS - 1); // one ms short of the wait

    expect(state.listPromises({ caseId: record.case.id })[0].retryAttemptedAt).toBeUndefined();
    expect(state.getCase(record.case.id)!.case.state).toBe("deferred");
    const actions = state.auditLog(false).entries.map((e) => e.action);
    expect(actions).toContain("promise_retry_evaluated");
    expect(actions).not.toContain("promise_retry_executed");
  });

  it("executes the retry and resolves the case once the notice window has fully elapsed", async () => {
    const state = buildGatedState();
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(record.case.id, { ...record, case: { ...record.case, state: "deferred" } });

    const dueMs = DAYTIME_MS + 500;
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    await state.processPromiseRetries(dueMs); // sends the notice
    await state.processPromiseRetries(dueMs + NOTICE_MS); // exactly the required wait

    const promise = state.listPromises({ caseId: record.case.id })[0];
    expect(promise.retryAttemptedAt).toBeDefined();
    const finalState = state.getCase(record.case.id)!.case.state;
    expect(["recovered", "failed"]).toContain(finalState);
    const actions = state.auditLog(false).entries.map((e) => e.action);
    expect(actions).toContain("promise_retry_executed");
    expect(actions).toContain(finalState);
    expect(state.auditLog(true).valid).toBe(true);
  });

  it("never bypasses a case genuinely awaiting human approval, however late its promise is", async () => {
    // The critical regression case: a case sitting in awaiting_approval
    // with a real pending approval (record.pending set — the only way
    // that state legitimately arises) must never be silently executed by
    // a promise's due date arriving. Only a human approve()/reject() may
    // resolve it — see runPromiseRetryIfDue's `record.pending` guard.
    const highRisk = fakeCatalog({
      payment_failure: { requiresApproval: true },
    });
    const state = new EngineState({
      llmProvider: new MockLlmProvider(),
      razorpayClient: new FakeRazorpayClient(),
      policyEngine: new PolicyEngine([...defaultRules(), preDebitNotificationRule(NOTICE_MS)]),
      catalog: highRisk,
      rngSeed: 1,
      holdoutPercent: 0,
      promiseRetryNoticeMs: NOTICE_MS,
    });
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    expect(record.case.state).toBe("awaiting_approval");
    expect(record.pending).toBeDefined();

    const dueMs = DAYTIME_MS + 500;
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    // Run the retry sweep well past the due date and the full notice window.
    await state.processPromiseRetries(dueMs + NOTICE_MS * 3);

    expect(state.getCase(record.case.id)!.case.state).toBe("awaiting_approval");
    expect(state.listApprovals().map((r) => r.case.id)).toContain(record.case.id);
    const promise = state.listPromises({ caseId: record.case.id })[0];
    expect(promise.retryAttemptedAt).toBeUndefined();
    const actions = state.auditLog(false).entries.map((e) => e.action);
    expect(actions).not.toContain("promise_retry_evaluated");
    expect(actions).not.toContain("promise_retry_executed");

    // A human can still approve it normally, exactly as if no promise existed.
    const approved = await state.approve(record.case.id);
    expect(["recovered", "failed"]).toContain(approved!.case.state);
  });

  it("without the rule wired in, a due retry on a deferred case executes immediately (opt-in gate)", async () => {
    const state = buildTestState(); // plain defaultRules(), no preDebitNotificationRule
    const record = await state.ingestSignal(makeTestSignal(), DAYTIME_MS);
    state.cases.set(record.case.id, { ...record, case: { ...record.case, state: "deferred" } });

    const dueMs = DAYTIME_MS + 500;
    state.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    await state.processPromiseRetries(dueMs); // single pass: notice + retry, no gate gap to wait out
    expect(["recovered", "failed"]).toContain(state.getCase(record.case.id)!.case.state);
    expect(state.listPromises({ caseId: record.case.id })[0].retryAttemptedAt).toBeDefined();
  });

  it("never sends a notice or attempts a retry for a holdout case", async () => {
    const holdoutState = new EngineState({
      llmProvider: new MockLlmProvider(),
      razorpayClient: new FakeRazorpayClient(),
      policyEngine: new PolicyEngine([...defaultRules(), preDebitNotificationRule(NOTICE_MS)]),
      catalog: fakeCatalog(),
      rngSeed: 1,
      holdoutPercent: 100,
      promiseRetryNoticeMs: NOTICE_MS,
    });
    const record = await holdoutState.ingestSignal(makeTestSignal(), DAYTIME_MS);
    expect(record.case.armGroup).toBe("holdout");
    holdoutState.cases.set(record.case.id, {
      ...record,
      case: { ...record.case, state: "deferred" },
    });

    const dueMs = DAYTIME_MS + 500;
    holdoutState.recordPromise({
      caseId: record.case.id,
      promisedAmountPaise: 300_00n,
      promisedForMs: dueMs,
      channel: "manual",
      nowMs: DAYTIME_MS,
    });

    await holdoutState.processPromiseRetries(dueMs + NOTICE_MS * 2);

    const promise = holdoutState.listPromises({ caseId: record.case.id })[0];
    expect(promise.notifiedAt).toBeUndefined();
    expect(promise.retryAttemptedAt).toBeUndefined();
    expect(holdoutState.getCase(record.case.id)!.case.state).toBe("deferred");
  });
});
