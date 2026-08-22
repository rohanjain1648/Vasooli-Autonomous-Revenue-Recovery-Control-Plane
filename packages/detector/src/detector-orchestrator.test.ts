import { describe, it, expect } from "vitest";
import { EventGenerator, predefinedRegimes } from "@vasooli/simulator";
import type { OrderEvent, SubscriptionEvent, InvoiceEvent } from "@vasooli/simulator";
import { DetectorOrchestrator } from "./detector-orchestrator.js";

describe("DetectorOrchestrator — E2E scenario", () => {
  it("simulates 500 payment events with a degradation regime and emits signals", () => {
    const regime = predefinedRegimes.hdfc_visa_down[0];
    const gen = new EventGenerator({
      seed: 42,
      baselineSuccessRate: 0.95,
      regimes: [regime],
    });
    const payments = gen.batch(500);

    const orchestrator = new DetectorOrchestrator();
    const signals = orchestrator.run({ payments }, regime.endMs + 1);

    expect(signals.length).toBeGreaterThan(0);
    for (const signal of signals) {
      expect(signal.exposurePaise).toBeGreaterThan(0n);
      expect(signal.category).toBe("payment_failure");
    }
  });

  it("runs all four detectors together and aggregates signals", () => {
    const nowMs = 100 * 24 * 60 * 60 * 1000; // day 100

    const orders: OrderEvent[] = [
      {
        kind: "order",
        id: "order_1",
        entityId: "cust_1",
        amountPaise: 20000n,
        createdAtMs: nowMs - 60 * 60 * 1000, // 1h ago, no capture -> abandoned
        capturedAtMs: null,
      },
    ];
    const subscriptions: SubscriptionEvent[] = [
      {
        kind: "subscription",
        id: "sub_1",
        entityId: "cust_2",
        amountPaise: 99900n,
        dueAtMs: nowMs - 3 * 24 * 60 * 60 * 1000, // 3 days overdue
        chargedAtMs: null,
        errorCode: "insufficient_funds",
      },
    ];
    const invoices: InvoiceEvent[] = [
      {
        kind: "invoice",
        id: "inv_1",
        entityId: "biz_1",
        amountPaise: 5_00_000n,
        issuedAtMs: nowMs - 100 * 24 * 60 * 60 * 1000,
        dueAtMs: nowMs - 45 * 24 * 60 * 60 * 1000, // 45 days overdue
        paidAtMs: null,
      },
    ];

    const orchestrator = new DetectorOrchestrator();
    const signals = orchestrator.run({ orders, subscriptions, invoices }, nowMs);

    const categories = signals.map((s) => s.category).sort();
    expect(categories).toEqual(
      ["b2b_receivable", "checkout_abandonment", "subscription_failure"].sort(),
    );
  });

  it("is deterministic: same seed and regime produce the same signal count", () => {
    const regime = predefinedRegimes.hdfc_visa_down[0];

    function runOnce() {
      const gen = new EventGenerator({
        seed: 7,
        baselineSuccessRate: 0.95,
        regimes: [regime],
      });
      const payments = gen.batch(1000);
      const orchestrator = new DetectorOrchestrator();
      return orchestrator.run({ payments }, regime.endMs + 1).length;
    }

    expect(runOnce()).toBe(runOnce());
  });
});
