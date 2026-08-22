import { describe, it, expect } from "vitest";
import { detectCheckoutAbandonment } from "./checkout-abandonment.js";
import type { OrderEvent } from "@vasooli/simulator";

function makeOrder(overrides: Partial<OrderEvent> = {}): OrderEvent {
  return {
    kind: "order",
    id: "order_1",
    entityId: "cust_1",
    amountPaise: 10000n,
    createdAtMs: 0,
    capturedAtMs: null,
    ...overrides,
  };
}

describe("detectCheckoutAbandonment", () => {
  it("flags an order with no capture past the TTL", () => {
    const order = makeOrder({ createdAtMs: 0 });
    const signals = detectCheckoutAbandonment([order], 31 * 60 * 1000, 30 * 60 * 1000);
    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("checkout_abandonment");
    expect(signals[0].exposurePaise).toBe(10000n);
  });

  it("does not flag an order still within the TTL grace period", () => {
    const order = makeOrder({ createdAtMs: 0 });
    const signals = detectCheckoutAbandonment([order], 5 * 60 * 1000, 30 * 60 * 1000);
    expect(signals).toHaveLength(0);
  });

  it("does not flag an order that has been captured", () => {
    const order = makeOrder({ createdAtMs: 0, capturedAtMs: 10 * 60 * 1000 });
    const signals = detectCheckoutAbandonment([order], 60 * 60 * 1000, 30 * 60 * 1000);
    expect(signals).toHaveLength(0);
  });
});
