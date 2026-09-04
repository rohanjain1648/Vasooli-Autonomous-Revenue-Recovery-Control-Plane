import { describe, it, expect } from "vitest";
import { buildTestState, makeTestSignal, DAYTIME_MS } from "./test-helpers.js";
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
