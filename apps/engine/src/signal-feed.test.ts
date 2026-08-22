import { describe, it, expect } from "vitest";
import { SignalFeed } from "./signal-feed.js";
import { buildTestState } from "./test-helpers.js";

describe("SignalFeed", () => {
  it("ingests cases over several ticks without throwing", async () => {
    const state = buildTestState();
    const feed = new SignalFeed(state, 7);

    for (let i = 0; i < 5; i++) {
      await feed.tick();
    }

    expect(state.cases.size).toBeGreaterThan(0);
    expect(state.auditLog(true).valid).toBe(true);
  });

  it("eventually produces a payment_failure signal from the injected outage regime", async () => {
    const state = buildTestState();
    const feed = new SignalFeed(state, 7);

    for (let i = 0; i < 10; i++) {
      await feed.tick();
    }

    const categories = new Set([...state.cases.values()].map((r) => r.case.category));
    expect(categories.has("payment_failure")).toBe(true);
  });
});
