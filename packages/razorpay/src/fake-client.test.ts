import { describe, it, expect } from "vitest";
import { FakeRazorpayClient } from "./fake-client.js";

describe("FakeRazorpayClient", () => {
  it("applyRefund returns a processed refund matching the requested amount", async () => {
    const client = new FakeRazorpayClient();
    const result = await client.applyRefund("pay_123", 50000n);
    expect(result.status).toBe("processed");
    expect(result.amountPaise).toBe(50000n);
    expect(result.paymentId).toBe("pay_123");
  });

  it("getPaymentStatus reflects a prior refund", async () => {
    const client = new FakeRazorpayClient();
    await client.applyRefund("pay_123", 50000n);
    const status = await client.getPaymentStatus("pay_123");
    expect(status).toBe("refunded");
  });

  it("getPaymentStatus defaults to 'created' for an unknown payment", async () => {
    const client = new FakeRazorpayClient();
    const status = await client.getPaymentStatus("pay_unknown");
    expect(status).toBe("created");
  });

  it("applyDiscount returns the requested discount and expiry", async () => {
    const client = new FakeRazorpayClient();
    const expiresAt = new Date("2026-12-31T00:00:00Z");
    const result = await client.applyDiscount("cust_1", 2000n, expiresAt);
    expect(result.discountPaise).toBe(2000n);
    expect(result.expiresAt).toBe(expiresAt.toISOString());
  });

  it("sendNotification returns a sent status for the requested channel", async () => {
    const client = new FakeRazorpayClient();
    const result = await client.sendNotification("cust_1", "email", "hello");
    expect(result.status).toBe("sent");
    expect(result.channel).toBe("email");
  });

  it("generates unique ids across calls", async () => {
    const client = new FakeRazorpayClient();
    const r1 = await client.applyRefund("pay_1", 100n);
    const r2 = await client.applyRefund("pay_2", 100n);
    expect(r1.id).not.toBe(r2.id);
  });

  it("does not sleep by default (fast for tests)", async () => {
    const client = new FakeRazorpayClient();
    const start = Date.now();
    await client.applyRefund("pay_1", 100n);
    expect(Date.now() - start).toBeLessThan(50);
  });
});
