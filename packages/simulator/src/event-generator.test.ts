import { describe, it, expect } from "vitest";
import { EventGenerator } from "./event-generator.js";
import { predefinedRegimes } from "./degradation.js";

describe("EventGenerator", () => {
  it("produces an identical stream for the same seed", () => {
    const gen1 = new EventGenerator({ seed: 42 });
    const gen2 = new EventGenerator({ seed: 42 });
    const batch1 = gen1.batch(50);
    const batch2 = gen2.batch(50);
    expect(batch1).toEqual(batch2);
  });

  it("produces a different stream for a different seed", () => {
    const gen1 = new EventGenerator({ seed: 1 });
    const gen2 = new EventGenerator({ seed: 2 });
    expect(gen1.batch(20)).not.toEqual(gen2.batch(20));
  });

  it("keeps amounts within the configured bounds", () => {
    const gen = new EventGenerator({
      seed: 7,
      minAmountPaise: 1000n,
      maxAmountPaise: 2000n,
    });
    for (const event of gen.batch(100)) {
      expect(event.amountPaise).toBeGreaterThanOrEqual(1000n);
      expect(event.amountPaise).toBeLessThanOrEqual(2000n);
    }
  });

  it("applies a degradation regime to lower the success rate within its window", () => {
    const regime = predefinedRegimes.hdfc_visa_down[0];
    const gen = new EventGenerator({
      seed: 99,
      baselineSuccessRate: 0.95,
      regimes: [regime],
    });
    const events = gen.batch(3000);

    const inWindow = events.filter(
      (e) =>
        e.cohort === regime.cohort &&
        e.timestampMs >= regime.startMs &&
        e.timestampMs < regime.endMs,
    );
    const outOfWindow = events.filter(
      (e) =>
        e.cohort === regime.cohort &&
        (e.timestampMs < regime.startMs || e.timestampMs >= regime.endMs),
    );

    expect(inWindow.length).toBeGreaterThan(10);
    expect(outOfWindow.length).toBeGreaterThan(10);

    const inWindowSuccessRate =
      inWindow.filter((e) => e.success).length / inWindow.length;
    const outOfWindowSuccessRate =
      outOfWindow.filter((e) => e.success).length / outOfWindow.length;

    expect(inWindowSuccessRate).toBeLessThan(outOfWindowSuccessRate);
  });

  it("tags failed events in an active regime with the regime's error code", () => {
    const regime = predefinedRegimes.hdfc_visa_down[0];
    const gen = new EventGenerator({
      seed: 5,
      baselineSuccessRate: 0.1, // force lots of failures for a robust sample
      regimes: [regime],
    });
    const events = gen.batch(2000);
    const failuresInWindow = events.filter(
      (e) =>
        e.cohort === regime.cohort &&
        !e.success &&
        e.timestampMs >= regime.startMs &&
        e.timestampMs < regime.endMs,
    );
    expect(failuresInWindow.length).toBeGreaterThan(0);
    for (const e of failuresInWindow) {
      expect(e.errorCode).toBe(regime.errorCode);
    }
  });
});
