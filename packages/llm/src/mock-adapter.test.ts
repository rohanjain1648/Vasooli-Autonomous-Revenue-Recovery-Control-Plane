import { describe, it, expect } from "vitest";
import type { RiskSignal } from "@vasooli/core";
import { MockLlmProvider } from "./mock-adapter.js";

function makeSignal(overrides: Partial<RiskSignal> = {}): RiskSignal {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    category: "payment_failure",
    entityId: "cust_1",
    exposurePaise: 5000n,
    detectedAt: new Date(0).toISOString(),
    evidence: {},
    ...overrides,
  };
}

describe("MockLlmProvider.diagnose", () => {
  const provider = new MockLlmProvider(10_00_00n);

  it("is deterministic for the same signal", async () => {
    const signal = makeSignal();
    const d1 = await provider.diagnose(signal);
    const d2 = await provider.diagnose(signal);
    expect(d1).toEqual(d2);
  });

  it("segments high-exposure signals as high_value", async () => {
    const signal = makeSignal({ exposurePaise: 20_00_00n });
    const diagnosis = await provider.diagnose(signal);
    expect(diagnosis.recommendedSegment).toBe("high_value");
  });

  it("segments low-exposure signals as standard", async () => {
    const signal = makeSignal({ exposurePaise: 500n });
    const diagnosis = await provider.diagnose(signal);
    expect(diagnosis.recommendedSegment).toBe("standard");
  });

  it("produces a confidence within [0,1]", async () => {
    const diagnosis = await provider.diagnose(makeSignal());
    expect(diagnosis.confidence).toBeGreaterThanOrEqual(0);
    expect(diagnosis.confidence).toBeLessThanOrEqual(1);
  });

  it.each([
    ["payment_failure", "issuer_down"],
    ["checkout_abandonment", "checkout_timeout"],
    ["subscription_failure", "mandate_charge_failed"],
    ["b2b_receivable", "promise_to_pay_breach"],
  ] as const)("maps %s to evidence code %s", async (category, expectedCode) => {
    const diagnosis = await provider.diagnose(makeSignal({ category }));
    expect(diagnosis.evidenceCode).toBe(expectedCode);
  });
});

describe("MockLlmProvider.generateContent", () => {
  const provider = new MockLlmProvider();

  it("fills a template with the provided context", async () => {
    const content = await provider.generateContent(
      { name: "email-reminder", description: "", requiresApproval: false, template: "Hi {{ name }}, pay {{ amount }}" },
      { name: "Asha", amount: "₹500" },
    );
    expect(content).toBe("Hi Asha, pay ₹500");
  });

  it("returns a placeholder when no template is configured", async () => {
    const content = await provider.generateContent(
      { name: "control", description: "", requiresApproval: false },
      {},
    );
    expect(content).toContain("control");
  });
});
