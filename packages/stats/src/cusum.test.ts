import { describe, it, expect } from "vitest";
import { cusum } from "./cusum.js";

describe("cusum", () => {
  it("reports no change point in a stable series", () => {
    const stable = new Array(20).fill(0.9);
    const result = cusum(stable, 0.9, 0.05, 0.5);
    expect(result.changePointIndex).toBeNull();
  });

  it("detects a downward shift shortly after it occurs", () => {
    const series = [...new Array(10).fill(0.9), ...new Array(10).fill(0.3)];
    const result = cusum(series, 0.9, 0.05, 0.3);
    expect(result.changePointIndex).not.toBeNull();
    expect(result.changePointIndex!).toBeGreaterThanOrEqual(9);
    expect(result.changePointIndex!).toBeLessThanOrEqual(14);
  });

  it("detects an upward shift as well (two-sided)", () => {
    const series = [...new Array(10).fill(0.2), ...new Array(10).fill(0.8)];
    const result = cusum(series, 0.2, 0.05, 0.3);
    expect(result.changePointIndex).not.toBeNull();
    expect(result.changePointIndex!).toBeGreaterThanOrEqual(9);
  });
});
