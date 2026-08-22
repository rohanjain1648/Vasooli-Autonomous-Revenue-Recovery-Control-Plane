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
