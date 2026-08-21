import { describe, it, expect } from "vitest";
import { alwaysValidPValue, sequentialUpliftTest } from "./msprt.js";

describe("alwaysValidPValue", () => {
  it("returns p=1 for no observations", () => {
    expect(alwaysValidPValue([], 1, 0.01).pValue).toBe(1);
  });

  it("gives a small p-value for a large, consistent effect relative to its variance", () => {
    const result = alwaysValidPValue([0.3], 0.001, 0.01);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("stays close to 1 for a near-zero effect", () => {
    const result = alwaysValidPValue([0.0001], 0.01, 0.01);
    expect(result.pValue).toBeGreaterThan(0.5);
  });
});

describe("sequentialUpliftTest", () => {
  it("returns p=1 when either arm has zero trials", () => {
    expect(sequentialUpliftTest(0, 0, 10, 100).pValue).toBe(1);
  });

  it("flags a large, well-separated uplift as significant", () => {
    const result = sequentialUpliftTest(800, 1000, 500, 1000);
    expect(result.pValue).toBeLessThan(0.05);
  });

  it("does not flag a negligible uplift as significant", () => {
    const result = sequentialUpliftTest(501, 1000, 500, 1000);
    expect(result.pValue).toBeGreaterThan(0.05);
  });
});
