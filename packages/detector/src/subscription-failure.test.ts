import { describe, it, expect } from "vitest";
import { detectSubscriptionFailure } from "./subscription-failure.js";
import type { SubscriptionEvent } from "@vasooli/simulator";

function makeSub(overrides: Partial<SubscriptionEvent> = {}): SubscriptionEvent {
  return {
    kind: "subscription",
    id: "sub_1",
    entityId: "cust_1",
    amountPaise: 50000n,
    dueAtMs: 0,
    chargedAtMs: null,
    errorCode: null,
    ...overrides,
  };
}

describe("detectSubscriptionFailure", () => {
  it("flags a mandate charge overdue past the grace period", () => {
    const sub = makeSub({ dueAtMs: 0, errorCode: "insufficient_funds" });
    const signals = detectSubscriptionFailure([sub], 2 * 24 * 60 * 60 * 1000);
    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("subscription_failure");
    expect(signals[0].evidence.errorCode).toBe("insufficient_funds");
  });

  it("does not flag a charge still within grace period", () => {
    const sub = makeSub({ dueAtMs: 0 });
    const signals = detectSubscriptionFailure([sub], 1000);
    expect(signals).toHaveLength(0);
  });

  it("does not flag a successfully charged subscription", () => {
    const sub = makeSub({ dueAtMs: 0, chargedAtMs: 1000 });
    const signals = detectSubscriptionFailure([sub], 5 * 24 * 60 * 60 * 1000);
    expect(signals).toHaveLength(0);
  });
});
