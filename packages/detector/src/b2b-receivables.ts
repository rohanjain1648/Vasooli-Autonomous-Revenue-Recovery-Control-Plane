import type { InvoiceEvent } from "@vasooli/simulator";
import type { RiskSignal } from "./types.js";
import { makeSignal } from "./signal-utils.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** DSO-relevant aging bucket for an unpaid invoice. */
export type AgingBucket = "current" | "30" | "60" | "90+";

export function agingBucket(daysOverdue: number): AgingBucket {
  if (daysOverdue < 30) return "current";
  if (daysOverdue < 60) return "30";
  if (daysOverdue < 90) return "60";
  return "90+";
}

/**
 * B2B Receivables Detector: unpaid invoices past due are bucketed into
 * aging tiers (30/60/90+ days). Only invoices that have breached a
 * "promise to pay" (30+ days overdue) are flagged as at-risk signals —
 * invoices still current are normal AR, not leakage.
 */
export function detectB2bReceivables(
  invoices: InvoiceEvent[],
  nowMs: number,
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const invoice of invoices) {
    if (invoice.paidAtMs !== null) continue; // settled
    const daysOverdue = Math.max(0, (nowMs - invoice.dueAtMs) / MS_PER_DAY);
    const bucket = agingBucket(daysOverdue);
    if (bucket === "current") continue; // not yet a promise-to-pay breach

    signals.push(
      makeSignal({
        category: "b2b_receivable",
        entityId: invoice.entityId,
        exposurePaise: invoice.amountPaise,
        nowMs,
        evidence: {
          invoiceId: invoice.id,
          dueAtMs: invoice.dueAtMs,
          daysOverdue,
          agingBucket: bucket,
        },
      }),
    );
  }

  return signals;
}
