import { randomUUID } from "node:crypto";
import { describe, it, expect } from "vitest";
import type { RiskSignal } from "@vasooli/core";
import { PolicyEngine, defaultRules } from "@vasooli/policy";
import { MockLlmProvider } from "@vasooli/llm";
import type { PlaybookArm } from "@vasooli/llm";
import { FakeRazorpayClient } from "@vasooli/razorpay";
import { Ledger } from "@vasooli/ledger";
import type { Arm } from "@vasooli/stats";
import { orchestrateCase, approveAndExecute, rejectApproval } from "./orchestrator.js";
import type { OrchestratorDeps, PendingApproval } from "./orchestrator.js";

/** Fixed local hour 12:00 — outside TRAI quiet hours (21:00-09:00) for every test unless noted. */
const DAYTIME_MS = new Date(2026, 0, 1, 12, 0, 0).getTime();
/** Fixed local hour 22:00 — inside TRAI quiet hours. */
const QUIET_HOUR_MS = new Date(2026, 0, 1, 22, 0, 0).getTime();

function makeSignal(overrides: Partial<RiskSignal> = {}): RiskSignal {
  return {
    id: randomUUID(),
    category: "payment_failure",
    entityId: "cust_123",
    exposurePaise: 500_00n,
    detectedAt: new Date(DAYTIME_MS).toISOString(),
    evidence: { errorCode: "issuer_down" },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<OrchestratorDeps> = {}): OrchestratorDeps {
  const emailArm: PlaybookArm & { id: string } = {
    id: "email_nudge",
    name: "email_nudge",
    description: "Send an email nudge",
    requiresApproval: false,
    template: "Hi {{ customer_name }}, please retry your payment of {{ amount }}.",
  };
  const banditArms: Arm[] = [{ id: "email_nudge", alpha: 1, beta: 1 }];

  return {
    llmProvider: new MockLlmProvider(),
    razorpayClient: new FakeRazorpayClient(),
    ledger: new Ledger(),
    policyEngine: new PolicyEngine(defaultRules()),
    playbookArms: [emailArm],
    banditArms,
    rngSeed: 1,
    holdoutPercent: 0,
    nowMs: DAYTIME_MS,
    ...overrides,
  };
}

describe("orchestrateCase", () => {
  it("resolves a holdout case immediately without diagnosis or execution", async () => {
    const deps = makeDeps({ holdoutPercent: 100 });
    const result = await orchestrateCase(makeSignal(), deps);

    expect(result.case.armGroup).toBe("holdout");
    expect(["recovered", "failed"]).toContain(result.case.state);
    expect(result.diagnosis).toBeUndefined();

    const actions = deps.ledger.all().map((e) => e.action);
    expect(actions).toContain("detected");
    expect(actions).not.toContain("diagnosed");
    expect(actions).not.toContain("executing");
    expect(deps.ledger.verify().valid).toBe(true);
  });

  it("PASSes a normal treatment case through diagnosis, planning, and execution to recovered/failed", async () => {
    const deps = makeDeps();
    const result = await orchestrateCase(makeSignal(), deps);

    expect(result.case.armGroup).toBe("treatment");
    expect(result.diagnosis).toBeDefined();
    expect(result.selectedArm).toBe("email_nudge");
    expect(result.policyDecision).toBe("PASS");
    expect(["recovered", "failed"]).toContain(result.case.state);

    const actions = deps.ledger.all().map((e) => e.action);
    expect(actions).toEqual([
      "detected",
      "diagnosed",
      "planned",
      "policy_evaluated",
      "executing",
      "execution_result",
      result.case.state,
    ]);
    expect(deps.ledger.verify().valid).toBe(true);

    // Bandit posterior for the selected arm was updated exactly once.
    const arm = deps.banditArms[0];
    expect(arm.alpha + arm.beta).toBe(3); // started at (1,1), one observation added
  });

  it("BLOCKs a case whose action cost exceeds its recoverable amount", async () => {
    const deps = makeDeps();
    // 100n paise action cost (non-control arm) > 50n paise exposure.
    const result = await orchestrateCase(makeSignal({ exposurePaise: 50n }), deps);

    expect(result.policyDecision).toBe("BLOCK");
    expect(result.case.state).toBe("stopped");

    const actions = deps.ledger.all().map((e) => e.action);
    expect(actions).toEqual(["detected", "diagnosed", "planned", "policy_evaluated", "stopped"]);
    expect(deps.ledger.verify().valid).toBe(true);
  });

  it("DEFERs a case detected during TRAI quiet hours", async () => {
    const deps = makeDeps({ nowMs: QUIET_HOUR_MS });
    const result = await orchestrateCase(makeSignal(), deps);

    expect(result.policyDecision).toBe("DEFER");
    expect(result.case.state).toBe("deferred");
    expect(deps.ledger.verify().valid).toBe(true);
  });

  it("halts at awaiting_approval for a high-risk arm, pending human sign-off", async () => {
    const discountArm: PlaybookArm & { id: string } = {
      id: "discount_offer",
      name: "discount_offer",
      description: "Offer a discount",
      requiresApproval: true,
    };
    const deps = makeDeps({
      playbookArms: [discountArm],
      banditArms: [{ id: "discount_offer", alpha: 1, beta: 1 }],
    });
    const result = await orchestrateCase(makeSignal(), deps);

    expect(result.policyDecision).toBe("NEEDS_APPROVAL");
    expect(result.case.state).toBe("awaiting_approval");

    const actions = deps.ledger.all().map((e) => e.action);
    expect(actions).toEqual(["detected", "diagnosed", "planned", "policy_evaluated"]);
    expect(deps.ledger.verify().valid).toBe(true);
  });
});

describe("approveAndExecute / rejectApproval", () => {
  function pendingFrom(deps: OrchestratorDeps, signal: ReturnType<typeof makeSignal>): PendingApproval {
    return {
      case: {
        id: randomUUID(),
        signalId: signal.id,
        category: signal.category,
        state: "awaiting_approval",
        armGroup: "treatment",
        exposurePaise: signal.exposurePaise,
        recoveredPaise: 0n,
        createdAt: new Date(DAYTIME_MS).toISOString(),
        updatedAt: new Date(DAYTIME_MS).toISOString(),
      },
      signal,
      arm: deps.playbookArms[0],
      selectedArm: deps.playbookArms[0].id,
    };
  }

  it("executes and resolves to recovered/failed on approval", async () => {
    const deps = makeDeps();
    const pending = pendingFrom(deps, makeSignal());

    const result = await approveAndExecute(pending, deps);

    expect(result.policyDecision).toBe("PASS");
    expect(["recovered", "failed"]).toContain(result.case.state);
    const actions = deps.ledger.all().map((e) => e.action);
    expect(actions).toEqual(["approved", "executing", "execution_result", result.case.state]);
    expect(deps.ledger.verify().valid).toBe(true);
  });

  it("stops the case without executing on rejection", () => {
    const deps = makeDeps();
    const pending = pendingFrom(deps, makeSignal());

    const result = rejectApproval(pending, deps);

    expect(result.case.state).toBe("stopped");
    const actions = deps.ledger.all().map((e) => e.action);
    expect(actions).toEqual(["rejected", "stopped"]);
    expect(deps.ledger.verify().valid).toBe(true);
  });
});
