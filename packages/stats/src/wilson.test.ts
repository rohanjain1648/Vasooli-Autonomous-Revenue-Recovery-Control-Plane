import { describe, it, expect } from "vitest";
import { wilsonInterval } from "./wilson.js";

describe("wilsonInterval", () => {
  it("matches the published reference for n=20, x=10 (p=0.5)", () => {
    const { point, lower, upper } = wilsonInterval(10, 20);
    expect(point).toBeCloseTo(0.5, 5);
    expect(lower).toBeCloseTo(0.299, 3);
    expect(upper).toBeCloseTo(0.701, 3);
  });

  it("returns a zero interval for zero trials", () => {
    expect(wilsonInterval(0, 0)).toEqual({ point: 0, lower: 0, upper: 1 });
  });

  it("narrows as the number of trials increases at the same proportion", () => {
    const small = wilsonInterval(50, 100);
    const large = wilsonInterval(500, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });

  it("stays within [0, 1] even at extreme proportions", () => {
    const { lower, upper } = wilsonInterval(1, 1);
    expect(lower).toBeGreaterThanOrEqual(0);
    expect(upper).toBeLessThanOrEqual(1);
  });

  it("returns maximum-uncertainty interval for zero trials", () => {
    const interval = wilsonInterval(0, 0);
    expect(interval.point).toBe(0);
    expect(interval.lower).toBe(0);
    expect(interval.upper).toBe(1);
  });
});
