import { describe, it, expect, vi, afterEach } from "vitest";
import type { RiskSignal } from "@vasooli/core";
import { OpenaiAdapter } from "./openai-adapter.js";

function makeSignal(overrides: Partial<RiskSignal> = {}): RiskSignal {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    category: "payment_failure",
    entityId: "cust_1",
    exposurePaise: 5_00_00n, // bigint — the thing plain JSON.stringify chokes on
    detectedAt: new Date(0).toISOString(),
    evidence: { dominantErrorCode: "issuer_down" },
    ...overrides,
  };
}

function mockFetchOnce(responseBody: unknown, ok = true) {
  const fetchSpy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    statusText: ok ? "OK" : "Internal Server Error",
    json: async () => responseBody,
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenaiAdapter.diagnose", () => {
  // Regression test: RiskSignal.exposurePaise is a bigint. Plain
  // JSON.stringify(signal) throws "Do not know how to serialize a
  // BigInt" — this went undetected because nothing in the repo actually
  // loaded the env vars that flip this adapter live until the env-loading
  // fix landed, so it had never actually run against a real signal.
  it("does not throw serializing a signal with a bigint exposurePaise", async () => {
    const fetchSpy = mockFetchOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              rootCause: "test",
              confidence: 0.9,
              evidenceCode: "issuer_down",
              recommendedSegment: "standard",
            }),
          },
        },
      ],
    });

    const adapter = new OpenaiAdapter({ apiKey: "test-key" });
    const diagnosis = await adapter.diagnose(makeSignal());

    expect(diagnosis.rootCause).toBe("test");
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // The bigint must have made it into the request as a plain string,
    // not been dropped or crashed the request body's construction.
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    const userContent = body.messages[1].content as string;
    expect(userContent).toContain("50000");
    expect(() => JSON.parse(userContent)).not.toThrow();
  });

  it("throws if the upstream response isn't valid JSON", async () => {
    const fetchSpy = mockFetchOnce({
      choices: [{ message: { content: "not json" } }],
    });
    void fetchSpy;
    const adapter = new OpenaiAdapter({ apiKey: "test-key" });
    await expect(adapter.diagnose(makeSignal())).rejects.toThrow(/not valid JSON/);
  });

  it("throws if the upstream response fails shape validation", async () => {
    mockFetchOnce({
      choices: [{ message: { content: JSON.stringify({ rootCause: "test" }) } }],
    });
    const adapter = new OpenaiAdapter({ apiKey: "test-key" });
    await expect(adapter.diagnose(makeSignal())).rejects.toThrow(/shape validation/);
  });

  it("throws with the status when the HTTP request itself fails", async () => {
    mockFetchOnce({}, false);
    const adapter = new OpenaiAdapter({ apiKey: "test-key" });
    await expect(adapter.diagnose(makeSignal())).rejects.toThrow(/500/);
  });
});
