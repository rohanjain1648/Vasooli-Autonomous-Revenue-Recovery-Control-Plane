import { newcombeInterval, sequentialUpliftTest } from "@vasooli/stats";
import type { EngineState } from "./state.js";

/**
 * Turns the raw per-cohort counts in EngineState into the headline
 * "incremental ₹" number the money wall shows: the treatment/holdout
 * recovery-rate gap, scaled to paise, with an always-valid p-value
 * (mSPRT) and a 95% confidence interval on the rate difference
 * (Newcombe) — see design spec §1's core thesis: measure incrementality,
 * not gross recovery.
 */
export function computeMetricsSnapshot(state: EngineState) {
  const base = state.metricsSnapshot();
  const t = base.treatment;
  const h = base.holdout;

  const uplift = sequentialUpliftTest(t.successes, t.n, h.successes, h.n);
  const rateInterval = newcombeInterval(t.successes, t.n, h.successes, h.n);

  // Extrapolate the rate gap to paise using the average exposure across
  // resolved cases in both cohorts, scaled to the treatment cohort's volume
  // (the holdout is deliberately smaller — see assignArm's holdoutPercent).
  const avgExposurePaise = averageExposure(state);
  const incrementalPaise = BigInt(Math.round(rateInterval.diff * Number(avgExposurePaise) * t.n));
  const ciWidthPaise = BigInt(
    Math.round(((rateInterval.upper - rateInterval.lower) / 2) * Number(avgExposurePaise) * t.n),
  );

  return {
    ...base,
    incrementalPaise: incrementalPaise.toString(),
    ciWidthPaise: ciWidthPaise.toString(),
    pValue: uplift.pValue,
    upliftRateDiff: rateInterval.diff,
    upliftRateLower: rateInterval.lower,
    upliftRateUpper: rateInterval.upper,
  };
}

function averageExposure(state: EngineState): bigint {
  const all = [...state.cases.values()];
  if (all.length === 0) return 0n;
  const total = all.reduce((sum, r) => sum + r.case.exposurePaise, 0n);
  return total / BigInt(all.length);
}
