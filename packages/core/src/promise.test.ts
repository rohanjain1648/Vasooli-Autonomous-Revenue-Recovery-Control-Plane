import { describe, it, expect } from "vitest";
import {
  canTransitionPromise,
  transitionPromise,
  isPromiseTerminal,
  InvalidPromiseTransitionError,
} from "./promise.js";

describe("promise-to-pay state machine", () => {
  it("allows promised -> honored", () => {
    expect(canTransitionPromise("promised", "honored")).toBe(true);
  });

  it("allows promised -> broken", () => {
    expect(canTransitionPromise("promised", "broken")).toBe(true);
  });

  it("allows promised -> partial", () => {
    expect(canTransitionPromise("promised", "partial")).toBe(true);
  });

  it("allows a partial payment to later resolve to honored or broken", () => {
    expect(canTransitionPromise("partial", "honored")).toBe(true);
    expect(canTransitionPromise("partial", "broken")).toBe(true);
  });

  it("rejects a move out of a terminal state", () => {
    expect(canTransitionPromise("honored", "broken")).toBe(false);
    expect(canTransitionPromise("broken", "honored")).toBe(false);
  });

  it("transitionPromise() returns the target state on a legal move", () => {
    expect(transitionPromise("promised", "honored")).toBe("honored");
  });

  it("transitionPromise() throws InvalidPromiseTransitionError on an illegal move", () => {
    expect(() => transitionPromise("honored", "promised")).toThrow(
      InvalidPromiseTransitionError,
    );
  });

  it("isPromiseTerminal is true only for honored and broken", () => {
    expect(isPromiseTerminal("honored")).toBe(true);
    expect(isPromiseTerminal("broken")).toBe(true);
    expect(isPromiseTerminal("promised")).toBe(false);
    expect(isPromiseTerminal("partial")).toBe(false);
  });
});
