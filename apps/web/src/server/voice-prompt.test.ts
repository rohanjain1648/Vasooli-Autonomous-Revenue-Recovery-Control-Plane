import { describe, it, expect } from "vitest";
import { buildVoiceInstructions, RECORD_PROMISE_TOOL } from "./voice-prompt.js";

describe("buildVoiceInstructions", () => {
  const base = {
    entityId: "cust_42",
    category: "subscription_failure",
    exposurePaise: "50000",
    errorReason: "mandate_charge_failed",
  };

  it("includes the customer reference, category, and formatted amount", () => {
    const prompt = buildVoiceInstructions(base);
    expect(prompt).toContain("cust_42");
    expect(prompt).toContain("subscription_failure");
    expect(prompt).toContain("₹500");
  });

  it("includes the error reason when given", () => {
    const prompt = buildVoiceInstructions(base);
    expect(prompt).toContain("mandate_charge_failed");
  });

  it("falls back to a generic reason when none is given", () => {
    const prompt = buildVoiceInstructions({ ...base, errorReason: undefined });
    expect(prompt).toContain("a payment issue");
  });

  it("names the merchant, defaulting when none is given", () => {
    expect(buildVoiceInstructions(base)).toContain("Vasooli Demo Merchant");
    expect(buildVoiceInstructions({ ...base, merchantName: "Acme Pay" })).toContain("Acme Pay");
  });

  it("instructs the model never to move money or guarantee waivers itself", () => {
    const prompt = buildVoiceInstructions(base);
    expect(prompt).toMatch(/never move money/i);
    expect(prompt.toLowerCase()).toContain("never");
  });

  it("accepts a bigint exposure amount", () => {
    const prompt = buildVoiceInstructions({ ...base, exposurePaise: 50000n });
    expect(prompt).toContain("₹500");
  });
});

describe("RECORD_PROMISE_TOOL", () => {
  it("is a function tool named record_promise_to_pay", () => {
    expect(RECORD_PROMISE_TOOL.type).toBe("function");
    expect(RECORD_PROMISE_TOOL.name).toBe("record_promise_to_pay");
  });

  it("requires amount_rupees and days_from_now", () => {
    expect(RECORD_PROMISE_TOOL.parameters.required).toEqual(["amount_rupees", "days_from_now"]);
  });
});
