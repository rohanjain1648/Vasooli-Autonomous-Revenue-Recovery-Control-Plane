/**
 * A degradation regime models a real-world fault window: for a span of
 * simulated time, a cohort's baseline success rate is multiplied down (or
 * up) to inject a detectable failure spike.
 */
export interface DegradationRegime {
  name: string;
  cohort: string; // e.g. "HDFC:card:visa" — matches PaymentEvent.cohort
  startMs: number;
  endMs: number;
  /** Applied to the baseline success probability: 0.3 = 70% relative drop. */
  successMultiplier: number;
  errorCode: string;
}

/** Returns the effective success probability for a cohort at a given time,
 * applying any active regime's multiplier to the baseline rate. */
export function applyRegimes(
  cohort: string,
  timestampMs: number,
  baselineSuccessRate: number,
  regimes: DegradationRegime[],
): number {
  for (const regime of regimes) {
    if (
      regime.cohort === cohort &&
      timestampMs >= regime.startMs &&
      timestampMs < regime.endMs
    ) {
      return Math.max(0, Math.min(1, baselineSuccessRate * regime.successMultiplier));
    }
  }
  return baselineSuccessRate;
}

/** Returns the injected error code for a cohort/time if a regime is active, else null. */
export function activeRegimeErrorCode(
  cohort: string,
  timestampMs: number,
  regimes: DegradationRegime[],
): string | null {
  for (const regime of regimes) {
    if (
      regime.cohort === cohort &&
      timestampMs >= regime.startMs &&
      timestampMs < regime.endMs
    ) {
      return regime.errorCode;
    }
  }
  return null;
}

/** Preset scenarios for demos and tests. Times are relative offsets in ms
 * from the simulation's t0 — callers add their own base timestamp. */
export const predefinedRegimes: Record<string, DegradationRegime[]> = {
  hdfc_visa_down: [
    {
      name: "HDFC Visa issuer outage",
      cohort: "HDFC:card:visa",
      startMs: 2 * 60 * 60 * 1000, // 2h into the run
      endMs: 4 * 60 * 60 * 1000, // 4h into the run
      successMultiplier: 0.25, // 75% relative drop
      errorCode: "issuer_down",
    },
  ],
  abandonment_surge: [
    {
      name: "Checkout abandonment surge",
      cohort: "checkout:*",
      startMs: 0,
      endMs: 6 * 60 * 60 * 1000,
      successMultiplier: 0.5,
      errorCode: "checkout_timeout",
    },
  ],
};
