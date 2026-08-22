import { describe, it, expect } from "vitest";
import { createRazorpayClient } from "./factory.js";
import { FakeRazorpayClient } from "./fake-client.js";
import { LiveRazorpayClient } from "./live-client.js";

describe("createRazorpayClient", () => {
  it("returns FakeRazorpayClient when no credentials are set", () => {
    const client = createRazorpayClient({} as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(FakeRazorpayClient);
  });

  it("returns LiveRazorpayClient when both key id and secret are set", () => {
    const client = createRazorpayClient({
      RAZORPAY_KEY_ID: "rzp_test_1",
      RAZORPAY_KEY_SECRET: "secret",
    } as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(LiveRazorpayClient);
  });

  it("returns FakeRazorpayClient when only one credential is set", () => {
    const client = createRazorpayClient({
      RAZORPAY_KEY_ID: "rzp_test_1",
    } as NodeJS.ProcessEnv);
    expect(client).toBeInstanceOf(FakeRazorpayClient);
  });
});
