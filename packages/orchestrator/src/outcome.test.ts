import { describe, it, expect } from "vitest";
import { simulatedOutcome, TREATMENT_SUCCESS_RATE, HOLDOUT_SUCCESS_RATE } from "./outcome.js";

describe("simulatedOutcome", () => {
  it("is deterministic for the same case id and probability", () => {
    const id = "00000000-0000-0000-0000-000000000042";
    expect(simulatedOutcome(id, 0.5)).toBe(simulatedOutcome(id, 0.5));
  });

  it("always fails at probability 0", () => {
    for (let i = 0; i < 200; i++) {
      expect(simulatedOutcome(`case_${i}`, 0)).toBe(false);
    }
  });

  it("always succeeds at probability 1", () => {
    for (let i = 0; i < 200; i++) {
      expect(simulatedOutcome(`case_${i}`, 1)).toBe(true);
    }
  });

  it("produces roughly the configured rate over many ids", () => {
    let successes = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (simulatedOutcome(`outcome_case_${i}`, 0.35)) successes++;
    }
    const rate = successes / n;
    expect(rate).toBeGreaterThan(0.3);
    expect(rate).toBeLessThan(0.4);
  });

  it("treatment rate exceeds holdout rate (sanity check on constants)", () => {
    expect(TREATMENT_SUCCESS_RATE).toBeGreaterThan(HOLDOUT_SUCCESS_RATE);
  });
});
