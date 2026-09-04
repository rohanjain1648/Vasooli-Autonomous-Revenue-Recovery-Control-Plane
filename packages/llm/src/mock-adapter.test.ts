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
  ] as const)("falls back to a fixed evidence code %s for %s with no evidence", async (category, expectedCode) => {
    const diagnosis = await provider.diagnose(makeSignal({ category }));
    expect(diagnosis.evidenceCode).toBe(expectedCode);
  });

  describe("evidence-driven evidenceCode (contextual bandit routing)", () => {
    it("passes through the detector's dominant error code for payment_failure", async () => {
      const diagnosis = await provider.diagnose(
        makeSignal({ category: "payment_failure", evidence: { dominantErrorCode: "insufficient_funds" } }),
      );
      expect(diagnosis.evidenceCode).toBe("insufficient_funds");
    });

    it("distinguishes a quick bounce from a slow cart drop-off by idle time", async () => {
      const quick = await provider.diagnose(
        makeSignal({ category: "checkout_abandonment", evidence: { ageMs: 60_000 } }),
      );
      const slow = await provider.diagnose(
        makeSignal({ category: "checkout_abandonment", evidence: { ageMs: 40 * 60 * 1000 } }),
      );
      expect(quick.evidenceCode).toBe("quick_bounce");
      expect(slow.evidenceCode).toBe("cart_review_dropoff");
    });

    it("passes through the mandate's actual errorCode for subscription_failure", async () => {
      const diagnosis = await provider.diagnose(
        makeSignal({
          category: "subscription_failure",
          evidence: { errorCode: "payment_frequency_limit_exceeded" },
        }),
      );
      expect(diagnosis.evidenceCode).toBe("payment_frequency_limit_exceeded");
    });

    it.each([
      ["30", "early_reminder_needed"],
      ["60", "escalation_needed"],
      ["90+", "collections_needed"],
    ] as const)("maps aging bucket %s to %s for b2b_receivable", async (bucket, expectedCode) => {
      const diagnosis = await provider.diagnose(
        makeSignal({ category: "b2b_receivable", evidence: { agingBucket: bucket } }),
      );
      expect(diagnosis.evidenceCode).toBe(expectedCode);
    });
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
