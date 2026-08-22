import { createHash } from "node:crypto";

/**
 * Deterministic stand-in for "did the customer actually pay after this
 * touch": a real system reads this off webhook events days later. For
 * the offline demo/tests, we derive a stable pseudo-outcome from the
 * case id and arm so re-running the same seeded batch always reproduces
 * the same recovered/failed split — this is what makes the mSPRT/Wilson
 * measurement over a simulated batch reproducible end to end.
 */
export function simulatedOutcome(caseId: string, successProbability: number): boolean {
  const hash = createHash("sha256").update(`${caseId}:outcome`).digest();
  const bucket = hash.readUInt32BE(0) % 10000;
  return bucket < successProbability * 10000;
}

/** Baseline success rates used by the demo orchestrator: treatment gets
 * an active nudge (higher recovery), holdout gets nothing (natural
 * baseline recovery only) — the gap between the two, measured with a
 * confidence interval, is the incremental ₹ headline metric. */
export const TREATMENT_SUCCESS_RATE = 0.35;
export const HOLDOUT_SUCCESS_RATE = 0.15;
