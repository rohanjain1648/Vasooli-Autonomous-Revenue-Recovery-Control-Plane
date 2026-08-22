import type { SubscriptionEvent } from "@vasooli/simulator";
import type { RiskSignal } from "./types.js";
import { makeSignal } from "./signal-utils.js";

/**
 * Subscription / Mandate Failure Detector: a mandate charge that is past
 * its due date with no successful charge is at-risk recurring revenue.
 * Also flags mandates hitting `payment_frequency_limit_exceeded`-class
 * errors, which typically require a manual re-authorization flow.
 */
export function detectSubscriptionFailure(
  subscriptions: SubscriptionEvent[],
  nowMs: number,
  graceMs = 24 * 60 * 60 * 1000, // 1 day grace past due date
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const sub of subscriptions) {
    if (sub.chargedAtMs !== null) continue; // charge succeeded
    const overdueMs = nowMs - sub.dueAtMs;
    if (overdueMs < graceMs) continue; // still within grace

    signals.push(
      makeSignal({
        category: "subscription_failure",
        entityId: sub.entityId,
        exposurePaise: sub.amountPaise,
        nowMs,
        evidence: {
          subscriptionId: sub.id,
          dueAtMs: sub.dueAtMs,
          overdueMs,
          errorCode: sub.errorCode,
        },
      }),
    );
  }

  return signals;
}
