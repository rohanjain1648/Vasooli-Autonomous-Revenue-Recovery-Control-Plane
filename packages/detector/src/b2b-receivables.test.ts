import { describe, it, expect } from "vitest";
import { detectB2bReceivables, agingBucket } from "./b2b-receivables.js";
import type { InvoiceEvent } from "@vasooli/simulator";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function makeInvoice(overrides: Partial<InvoiceEvent> = {}): InvoiceEvent {
  return {
    kind: "invoice",
    id: "inv_1",
    entityId: "biz_1",
    amountPaise: 500000n,
    issuedAtMs: 0,
    dueAtMs: 0,
    paidAtMs: null,
    ...overrides,
  };
}

describe("agingBucket", () => {
  it("buckets days overdue correctly", () => {
    expect(agingBucket(10)).toBe("current");
    expect(agingBucket(30)).toBe("30");
    expect(agingBucket(59)).toBe("30");
    expect(agingBucket(60)).toBe("60");
    expect(agingBucket(90)).toBe("90+");
  });
});

describe("detectB2bReceivables", () => {
  it("does not flag an invoice still current", () => {
    const inv = makeInvoice({ dueAtMs: 0 });
    const signals = detectB2bReceivables([inv], 10 * MS_PER_DAY);
    expect(signals).toHaveLength(0);
  });

  it("flags an invoice 30+ days overdue", () => {
    const inv = makeInvoice({ dueAtMs: 0 });
    const signals = detectB2bReceivables([inv], 35 * MS_PER_DAY);
    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("b2b_receivable");
    expect(signals[0].evidence.agingBucket).toBe("30");
  });

  it("flags a 90+ day overdue invoice with the correct bucket", () => {
    const inv = makeInvoice({ dueAtMs: 0 });
    const signals = detectB2bReceivables([inv], 95 * MS_PER_DAY);
    expect(signals[0].evidence.agingBucket).toBe("90+");
  });

  it("does not flag a paid invoice", () => {
    const inv = makeInvoice({ dueAtMs: 0, paidAtMs: 5 * MS_PER_DAY });
    const signals = detectB2bReceivables([inv], 95 * MS_PER_DAY);
    expect(signals).toHaveLength(0);
  });
});
