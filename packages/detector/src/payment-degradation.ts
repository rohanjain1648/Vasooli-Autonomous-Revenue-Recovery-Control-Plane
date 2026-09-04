import { cusum } from "@vasooli/stats";
import type { PaymentEvent } from "@vasooli/simulator";
import type { PaymentDetectorState, RiskSignal } from "./types.js";
import { makeSignal } from "./signal-utils.js";

function getOrCreateCohort(state: PaymentDetectorState, cohort: string) {
  let stats = state.cohorts.get(cohort);
  if (!stats) {
    stats = {
      cohort,
      totalPayments: 0,
      capturedPayments: 0,
      failedPayments: 0,
      windowSuccessRates: [],
      errorCodeTally: new Map(),
    };
    state.cohorts.set(cohort, stats);
  }
  return stats;
}

/** The failure error code with the highest count this window, or null if
 * no failures carried a code (e.g. an empty or all-success window). */
function dominantErrorCode(tally: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of tally) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Payment Degradation Detector: buckets incoming payment events into
 * per-cohort rolling windows, computes a success rate per window, and runs
 * two-sided CUSUM over the window series to flag a change point (issuer or
 * gateway outage) vs. the configured baseline success rate.
 */
export function detectPaymentDegradation(
  state: PaymentDetectorState,
  events: PaymentEvent[],
  nowMs: number,
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const event of events) {
    const stats = getOrCreateCohort(state, event.cohort);
    stats.totalPayments += 1;
    if (event.success) {
      stats.capturedPayments += 1;
    } else {
      stats.failedPayments += 1;
      if (event.errorCode) {
        stats.errorCodeTally.set(event.errorCode, (stats.errorCodeTally.get(event.errorCode) ?? 0) + 1);
      }
    }

    if (stats.totalPayments % state.windowSize === 0) {
      const windowRate = stats.capturedPayments / stats.totalPayments;
      stats.windowSuccessRates.push(windowRate);

      const result = cusum(
        stats.windowSuccessRates,
        state.baselineSuccessRate,
        state.cusumK,
        state.cusumH,
      );

      if (
        result.changePointIndex !== null &&
        result.changePointIndex === stats.windowSuccessRates.length - 1
      ) {
        const exposure = BigInt(stats.failedPayments) * 50_00n; // ₹50 assumed avg exposure per failure
        signals.push(
          makeSignal({
            category: "payment_failure",
            entityId: stats.cohort,
            exposurePaise: exposure > 0n ? exposure : 50_00n,
            nowMs,
            evidence: {
              cohort: stats.cohort,
              windowSuccessRate: windowRate,
              baselineSuccessRate: state.baselineSuccessRate,
              totalPayments: stats.totalPayments,
              failedPayments: stats.failedPayments,
              cusumChangePointIndex: result.changePointIndex,
              cusumFinalLower: result.finalLower,
              cusumFinalUpper: result.finalUpper,
              dominantErrorCode: dominantErrorCode(stats.errorCodeTally),
            },
          }),
        );
        // Reset the CUSUM series so the same sustained outage doesn't
        // re-fire every window; a fresh baseline deviation must accumulate
        // again before the next signal.
        stats.windowSuccessRates = [];
        stats.errorCodeTally = new Map();
      }
    }
  }

  return signals;
}
