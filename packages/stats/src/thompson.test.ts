import { describe, it, expect } from "vitest";
import { selectArm, updateArm, createSeededRandom, type Arm } from "./thompson.js";

describe("thompson sampling", () => {
  it("is deterministic for a fixed seed", () => {
    const arms: Arm[] = [
      { id: "a", alpha: 1, beta: 1 },
      { id: "b", alpha: 1, beta: 1 },
    ];
    const r1 = selectArm(arms, createSeededRandom(42));
    const r2 = selectArm(arms, createSeededRandom(42));
    expect(r1).toBe(r2);
  });

  it("favors the arm with the stronger posterior over many draws", () => {
    const arms: Arm[] = [
      { id: "strong", alpha: 80, beta: 20 },
      { id: "weak", alpha: 20, beta: 80 },
    ];
    const rng = createSeededRandom(1);
    let strongWins = 0;
    for (let i = 0; i < 200; i++) {
      if (selectArm(arms, rng) === "strong") strongWins++;
    }
    expect(strongWins).toBeGreaterThan(150);
  });

  it("updateArm increments alpha on success and beta on failure", () => {
    const arm: Arm = { id: "x", alpha: 1, beta: 1 };
    expect(updateArm(arm, true)).toEqual({ id: "x", alpha: 2, beta: 1 });
    expect(updateArm(arm, false)).toEqual({ id: "x", alpha: 1, beta: 2 });
  });

  it("selectArm throws on an empty arm list", () => {
    expect(() => selectArm([], createSeededRandom(1))).toThrow();
  });
});
