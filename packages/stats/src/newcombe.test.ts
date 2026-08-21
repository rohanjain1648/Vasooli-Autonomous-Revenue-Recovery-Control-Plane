import { describe, it, expect } from "vitest";
import { newcombeInterval } from "./newcombe.js";

describe("newcombeInterval", () => {
  it("returns diff=0 with an interval straddling zero when proportions are equal", () => {
    const { diff, lower, upper } = newcombeInterval(50, 100, 50, 100);
    expect(diff).toBe(0);
    expect(lower).toBeLessThan(0);
    expect(upper).toBeGreaterThan(0);
  });

  it("excludes zero when the two proportions are clearly separated with large samples", () => {
    const { diff, lower, upper } = newcombeInterval(800, 1000, 500, 1000);
    expect(diff).toBeCloseTo(0.3, 5);
    expect(lower).toBeGreaterThan(0);
    expect(upper).toBeGreaterThan(lower);
  });

  it("narrows with larger sample sizes at the same proportions", () => {
    const small = newcombeInterval(30, 100, 20, 100);
    const large = newcombeInterval(300, 1000, 200, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });
});
