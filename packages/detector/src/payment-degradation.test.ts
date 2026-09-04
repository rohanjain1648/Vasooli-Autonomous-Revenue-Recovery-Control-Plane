import { describe, it, expect } from "vitest";
import { EventGenerator, predefinedRegimes } from "@vasooli/simulator";
import { detectPaymentDegradation } from "./payment-degradation.js";
import { createPaymentDetectorState } from "./types.js";

describe("detectPaymentDegradation", () => {
  it("emits no signal for a healthy cohort at baseline success rate", () => {
    const state = createPaymentDetectorState(0.9);
    const gen = new EventGenerator({ seed: 1, baselineSuccessRate: 0.9 });
    const events = gen.batch(2000);

    const signals = detectPaymentDegradation(state, events, Date.now());
    expect(signals).toHaveLength(0);
  });

  it("flags a cohort whose success rate drops sharply below baseline", () => {
    const regime = predefinedRegimes.hdfc_visa_down[0];
    const state = createPaymentDetectorState(0.95, 15, 0.02, 0.1);
    const gen = new EventGenerator({
      seed: 2,
      baselineSuccessRate: 0.95,
      regimes: [regime],
    });
    // Generate enough events to populate several windows inside the outage.
    const events = gen.batch(4000);

    const signals = detectPaymentDegradation(state, events, regime.endMs);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].category).toBe("payment_failure");
    expect(signals[0].exposurePaise).toBeGreaterThan(0n);
  });

  it("reports the dominant failure error code for the fired window, feeding contextual arm routing", () => {
    const regime = predefinedRegimes.hdfc_visa_down[0];
    const state = createPaymentDetectorState(0.95, 15, 0.02, 0.1);
    const gen = new EventGenerator({
      seed: 2,
      baselineSuccessRate: 0.95,
      regimes: [regime],
    });
    const events = gen.batch(4000);

    const signals = detectPaymentDegradation(state, events, regime.endMs);
    expect(signals.length).toBeGreaterThan(0);
    // The regime injects "issuer_down" on every failure in its window, so
    // it must dominate the tally even though baseline noise contributes
    // a few unrelated codes too.
    expect(signals[0].evidence.dominantErrorCode).toBe(regime.errorCode);
  });

  it("is deterministic for the same input", () => {
    const state1 = createPaymentDetectorState();
    const state2 = createPaymentDetectorState();
    const gen1 = new EventGenerator({ seed: 3, baselineSuccessRate: 0.5 });
    const gen2 = new EventGenerator({ seed: 3, baselineSuccessRate: 0.5 });
    const events1 = gen1.batch(500);
    const events2 = gen2.batch(500);

    const signals1 = detectPaymentDegradation(state1, events1, 10_000_000);
    const signals2 = detectPaymentDegradation(state2, events2, 10_000_000);
    expect(signals1.length).toBe(signals2.length);
  });
});
