import type { OrderEvent } from "@vasooli/simulator";
import type { RiskSignal } from "./types.js";
import { makeSignal } from "./signal-utils.js";

/**
 * Checkout Abandonment Detector: an order with no captured payment past a
 * TTL from creation is flagged as at-risk revenue. Stateless — evaluates
 * whatever order snapshot it's given at `nowMs`.
 */
export function detectCheckoutAbandonment(
  orders: OrderEvent[],
  nowMs: number,
  ttlMs = 30 * 60 * 1000, // 30 minutes
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const order of orders) {
    if (order.capturedAtMs !== null) continue; // converted, not at risk
    const ageMs = nowMs - order.createdAtMs;
    if (ageMs < ttlMs) continue; // still within grace period

    signals.push(
      makeSignal({
        category: "checkout_abandonment",
        entityId: order.entityId,
        exposurePaise: order.amountPaise,
        nowMs,
        evidence: {
          orderId: order.id,
          createdAtMs: order.createdAtMs,
          ageMs,
          ttlMs,
        },
      }),
    );
  }

  return signals;
}
