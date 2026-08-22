import { describe, it, expect } from "vitest";
import { assignArm } from "./assignment.js";

describe("assignArm", () => {
  it("is stable for the same case id", () => {
    const id = "00000000-0000-0000-0000-000000000001";
    expect(assignArm(id)).toBe(assignArm(id));
  });

  it("produces roughly the configured holdout split over many ids", () => {
    let holdout = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      if (assignArm(`case_${i}`, 20) === "holdout") holdout++;
    }
    const rate = holdout / n;
    expect(rate).toBeGreaterThan(0.15);
    expect(rate).toBeLessThan(0.25);
  });

  it("respects a 0% holdout (always treatment)", () => {
    for (let i = 0; i < 100; i++) {
      expect(assignArm(`case_${i}`, 0)).toBe("treatment");
    }
  });
});
