import { describe, it, expect } from "vitest";
import type { RecoveryCase } from "@vasooli/core";
import { PolicyEngine } from "./evaluator.js";
import {
  defaultRules,
  traiQuietHoursRule,
  economicViabilityRule,
  maxTouchesPerCaseRule,
  coolOffBetweenTouchesRule,
  hardStopRule,
  humanApprovalForHighRiskRule,
} from "./rules.js";
import type { PolicyContext } from "./types.js";

function makeCase(overrides: Partial<RecoveryCase> = {}): RecoveryCase {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    signalId: "00000000-0000-0000-0000-000000000002",
    category: "payment_failure",
    state: "planned",
    armGroup: "treatment",
    exposurePaise: 100000n,
    recoveredPaise: 0n,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function makeContext(overrides: Partial<PolicyContext> = {}): PolicyContext {
  return {
    case: makeCase(),
    nowMs: new Date("2026-01-01T12:00:00Z").getTime(), // noon, outside quiet hours
    recentTouches: 0,
    estimatedRecoverablePaise: 100000n,
    actionCostPaise: 1000n,
    isHighRiskAction: false,
    ...overrides,
  };
}

describe("traiQuietHoursRule", () => {
  const rule = traiQuietHoursRule(21, 9);

  it("DEFERs at 22:30 (inside quiet hours)", () => {
    const ctx = makeContext({ nowMs: new Date("2026-01-01T22:30:00").getTime() });
    expect(rule.evaluate(ctx)?.decision).toBe("DEFER");
  });

  it("PASSes at 10:00 (outside quiet hours)", () => {
    const ctx = makeContext({ nowMs: new Date("2026-01-01T10:00:00").getTime() });
    expect(rule.evaluate(ctx)).toBeNull();
  });

  it("DEFERs at 03:00 (inside overnight quiet window)", () => {
    const ctx = makeContext({ nowMs: new Date("2026-01-01T03:00:00").getTime() });
    expect(rule.evaluate(ctx)?.decision).toBe("DEFER");
  });
});

describe("economicViabilityRule", () => {
  const rule = economicViabilityRule();

  it("BLOCKs when cost exceeds recoverable amount", () => {
    const ctx = makeContext({ actionCostPaise: 5000n, estimatedRecoverablePaise: 4000n });
    expect(rule.evaluate(ctx)?.decision).toBe("BLOCK");
  });

  it("PASSes when cost is below recoverable amount", () => {
    const ctx = makeContext({ actionCostPaise: 1000n, estimatedRecoverablePaise: 100000n });
    expect(rule.evaluate(ctx)).toBeNull();
  });

  it("PASSes when cost exactly equals recoverable amount", () => {
    const ctx = makeContext({ actionCostPaise: 1000n, estimatedRecoverablePaise: 1000n });
    expect(rule.evaluate(ctx)).toBeNull();
  });
});

describe("maxTouchesPerCaseRule", () => {
  const rule = maxTouchesPerCaseRule(3);

  it("BLOCKs at the limit", () => {
    expect(rule.evaluate(makeContext({ recentTouches: 3 }))?.decision).toBe("BLOCK");
  });

  it("PASSes below the limit", () => {
    expect(rule.evaluate(makeContext({ recentTouches: 2 }))).toBeNull();
  });
});

describe("coolOffBetweenTouchesRule", () => {
  const rule = coolOffBetweenTouchesRule(4 * 60 * 60 * 1000);

  it("DEFERs if last touch was recent", () => {
    const now = new Date("2026-01-01T12:00:00").getTime();
    const ctx = makeContext({ nowMs: now, lastTouchAtMs: now - 60 * 60 * 1000 });
    expect(rule.evaluate(ctx)?.decision).toBe("DEFER");
  });

  it("PASSes if cool-off has elapsed", () => {
    const now = new Date("2026-01-01T12:00:00").getTime();
    const ctx = makeContext({ nowMs: now, lastTouchAtMs: now - 5 * 60 * 60 * 1000 });
    expect(rule.evaluate(ctx)).toBeNull();
  });

  it("PASSes when there is no prior touch", () => {
    expect(rule.evaluate(makeContext({ lastTouchAtMs: undefined }))).toBeNull();
  });
});

describe("hardStopRule", () => {
  const rule = hardStopRule();

  it.each(["recovered", "failed", "stopped"] as const)("BLOCKs a %s case", (state) => {
    const ctx = makeContext({ case: makeCase({ state }) });
    expect(rule.evaluate(ctx)?.decision).toBe("BLOCK");
  });

  it.each(["detected", "diagnosing", "planned", "executing"] as const)(
    "PASSes a %s case",
    (state) => {
      const ctx = makeContext({ case: makeCase({ state }) });
      expect(rule.evaluate(ctx)).toBeNull();
    },
  );
});

describe("humanApprovalForHighRiskRule", () => {
  const rule = humanApprovalForHighRiskRule();

  it("requires approval for a high-risk action", () => {
    const ctx = makeContext({ isHighRiskAction: true });
    expect(rule.evaluate(ctx)?.decision).toBe("NEEDS_APPROVAL");
  });

  it("PASSes a normal action", () => {
    expect(rule.evaluate(makeContext({ isHighRiskAction: false }))).toBeNull();
  });
});

describe("PolicyEngine — combined evaluation", () => {
  const engine = new PolicyEngine(defaultRules());

  it("PASSes a clean, viable, low-risk case at a normal hour", () => {
    const evaluation = engine.evaluate(makeContext());
    expect(evaluation.finalDecision).toBe("PASS");
  });

  it("BLOCK wins over DEFER when both fire (hard stop during quiet hours)", () => {
    const ctx = makeContext({
      case: makeCase({ state: "stopped" }),
      nowMs: new Date("2026-01-01T22:00:00").getTime(),
    });
    const evaluation = engine.evaluate(ctx);
    expect(evaluation.finalDecision).toBe("BLOCK");
    expect(evaluation.decisions.length).toBeGreaterThanOrEqual(2);
  });

  it("DEFER wins over NEEDS_APPROVAL when both fire", () => {
    const ctx = makeContext({
      nowMs: new Date("2026-01-01T22:00:00").getTime(),
      isHighRiskAction: true,
    });
    const evaluation = engine.evaluate(ctx);
    expect(evaluation.finalDecision).toBe("DEFER");
  });

  it("NEEDS_APPROVAL surfaces alone for an otherwise-clean high-risk case", () => {
    const evaluation = engine.evaluate(makeContext({ isHighRiskAction: true }));
    expect(evaluation.finalDecision).toBe("NEEDS_APPROVAL");
  });

  it("retains every fired rule's verdict even when overridden", () => {
    const ctx = makeContext({
      case: makeCase({ state: "stopped" }),
      actionCostPaise: 999999999n,
    });
    const evaluation = engine.evaluate(ctx);
    const ruleIds = evaluation.decisions.map((d) => d.ruleId);
    expect(ruleIds).toContain("hard_stop_terminal");
    expect(ruleIds).toContain("economic_viability");
  });

  it("is deterministic: same context evaluated twice yields the same result", () => {
    const ctx = makeContext({ isHighRiskAction: true });
    expect(engine.evaluate(ctx)).toEqual(engine.evaluate(ctx));
  });
});
