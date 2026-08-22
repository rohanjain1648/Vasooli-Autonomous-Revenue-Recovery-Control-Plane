import { describe, it, expect } from "vitest";
import {
  canTransition,
  transition,
  isTerminal,
  InvalidTransitionError,
} from "./state-machine.js";

describe("recovery case state machine", () => {
  it("allows detected -> diagnosing", () => {
    expect(canTransition("detected", "diagnosing")).toBe(true);
  });

  it("allows detected -> holdout for randomized cases", () => {
    expect(canTransition("detected", "holdout")).toBe(true);
  });

  it("rejects recovered -> detected", () => {
    expect(canTransition("recovered", "detected")).toBe(false);
  });

  it("rejects a case skipping straight from detected to executing", () => {
    expect(canTransition("detected", "executing")).toBe(false);
  });

  it("transition() returns the target state on a legal move", () => {
    expect(transition("detected", "diagnosing")).toBe("diagnosing");
  });

  it("transition() throws InvalidTransitionError on an illegal move", () => {
    expect(() => transition("recovered", "detected")).toThrow(
      InvalidTransitionError,
    );
  });

  it("isTerminal is true for recovered, failed, and stopped", () => {
    expect(isTerminal("recovered")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("stopped")).toBe(true);
  });

  it("isTerminal is false for non-terminal states", () => {
    expect(isTerminal("detected")).toBe(false);
    expect(isTerminal("executing")).toBe(false);
  });

  it("every state can eventually reach 'stopped' (hard stop is always reachable) except terminal states", () => {
    const nonTerminal: Array<import("./types.js").CaseState> = [
      "detected",
      "diagnosing",
      "planned",
      "awaiting_approval",
      "executing",
      "holdout",
      "deferred",
    ];
    for (const state of nonTerminal) {
      expect(canTransition(state, "stopped")).toBe(true);
    }
  });

  it("allows holdout -> stopped (F6: holdout must be reachable by hard stop)", () => {
    expect(canTransition("holdout", "stopped")).toBe(true);
  });

  it("allows executing -> awaiting_approval (F6: mid-execution approval re-gating)", () => {
    expect(canTransition("executing", "awaiting_approval")).toBe(true);
  });

  it("allows awaiting_approval -> deferred (F5: TRAI quiet-hour deferral)", () => {
    expect(canTransition("awaiting_approval", "deferred")).toBe(true);
  });

  it("allows deferred -> awaiting_approval (F5: retry after quiet hours end)", () => {
    expect(canTransition("deferred", "awaiting_approval")).toBe(true);
  });

  it("allows deferred -> stopped (F5: hard stop reachable from deferred)", () => {
    expect(canTransition("deferred", "stopped")).toBe(true);
  });

  it("isTerminal is false for deferred", () => {
    expect(isTerminal("deferred")).toBe(false);
  });
});
