import { describe, it, expect } from "vitest";
import { Ledger } from "./ledger.js";

describe("Ledger", () => {
  it("chains entries so each entry's prevHash is the previous entry's hash", () => {
    const ledger = new Ledger();
    const e1 = ledger.append({
      actor: "system",
      caseId: "c1",
      action: "signal_detected",
      payload: { exposurePaise: "1000" },
    });
    const e2 = ledger.append({
      actor: "agent",
      caseId: "c1",
      action: "diagnosis_proposed",
      payload: {},
    });
    expect(e2.prevHash).toBe(e1.hash);
  });

  it("the first entry chains from the genesis hash", () => {
    const ledger = new Ledger();
    const e1 = ledger.append({
      actor: "system",
      caseId: "c1",
      action: "signal_detected",
      payload: {},
    });
    expect(e1.prevHash).toBe("0".repeat(64));
  });

  it("verify() succeeds on an untampered chain", () => {
    const ledger = new Ledger();
    ledger.append({ actor: "system", caseId: "c1", action: "signal_detected", payload: {} });
    ledger.append({ actor: "agent", caseId: "c1", action: "diagnosis_proposed", payload: {} });
    ledger.append({ actor: "policy", caseId: "c1", action: "gate_pass", payload: {} });
    expect(ledger.verify()).toEqual({ valid: true, firstBrokenIndex: null });
  });

  it("verify() fails and identifies the index when an entry is tampered with", () => {
    const ledger = new Ledger();
    ledger.append({
      actor: "system",
      caseId: "c1",
      action: "signal_detected",
      payload: { exposurePaise: "1000" },
    });
    ledger.append({ actor: "agent", caseId: "c1", action: "diagnosis_proposed", payload: {} });
    ledger._tamperForTest(0, { payload: { exposurePaise: "9999999" } });
    const result = ledger.verify();
    expect(result.valid).toBe(false);
    expect(result.firstBrokenIndex).toBe(0);
  });

  it("produces the same hash regardless of key insertion order in the payload", () => {
    const now = () => "2026-08-21T00:00:00.000Z";
    const a = new Ledger();
    const entryA = a.append(
      { actor: "x", caseId: "c", action: "a", payload: { b: 1, a: 2 } },
      now,
    );
    const b = new Ledger();
    const entryB = b.append(
      { actor: "x", caseId: "c", action: "a", payload: { a: 2, b: 1 } },
      now,
    );
    expect(entryA.hash).toBe(entryB.hash);
  });
});

describe("Ledger demo tamper/restore", () => {
  function threeEntryLedger(): Ledger {
    const ledger = new Ledger();
    ledger.append({ actor: "system", caseId: "c1", action: "detected", payload: {} });
    ledger.append({ actor: "agent", caseId: "c1", action: "diagnosed", payload: {} });
    ledger.append({ actor: "policy", caseId: "c1", action: "policy_evaluated", payload: {} });
    return ledger;
  }

  it("demoTamper breaks verify() at the tampered index", () => {
    const ledger = threeEntryLedger();
    const result = ledger.demoTamper(1);
    expect(result.ok).toBe(true);
    expect(ledger.verify()).toEqual({ valid: false, firstBrokenIndex: 1 });
    expect(ledger.demoTamperedIndex()).toBe(1);
  });

  it("demoRestore undoes the tamper exactly, verify() passes again", () => {
    const ledger = threeEntryLedger();
    ledger.demoTamper(1);
    const restored = ledger.demoRestore();
    expect(restored.ok).toBe(true);
    expect(ledger.verify()).toEqual({ valid: true, firstBrokenIndex: null });
    expect(ledger.demoTamperedIndex()).toBeNull();
  });

  it("refuses a second tamper while one is already pending", () => {
    const ledger = threeEntryLedger();
    ledger.demoTamper(0);
    const second = ledger.demoTamper(2);
    expect(second.ok).toBe(false);
  });

  it("refuses an out-of-range index", () => {
    const ledger = threeEntryLedger();
    const result = ledger.demoTamper(99);
    expect(result.ok).toBe(false);
  });

  it("demoRestore on a clean chain is a no-op", () => {
    const ledger = threeEntryLedger();
    expect(ledger.demoRestore()).toEqual({ ok: false });
  });
});
