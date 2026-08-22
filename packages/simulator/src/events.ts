import type { LeakageCategory } from "@vasooli/core";

/** A single simulated payment attempt. */
export interface PaymentEvent {
  kind: "payment";
  id: string;
  entityId: string;
  cohort: string; // e.g. "HDFC:card:visa"
  amountPaise: bigint;
  success: boolean;
  errorCode: string | null;
  timestampMs: number;
}

/** A checkout order that may or may not convert to a captured payment. */
export interface OrderEvent {
  kind: "order";
  id: string;
  entityId: string;
  amountPaise: bigint;
  createdAtMs: number;
  capturedAtMs: number | null; // null = not yet captured
}

/** A subscription mandate charge attempt. */
export interface SubscriptionEvent {
  kind: "subscription";
  id: string;
  entityId: string;
  amountPaise: bigint;
  dueAtMs: number;
  chargedAtMs: number | null;
  errorCode: string | null;
}

/** A B2B invoice with an aging clock. */
export interface InvoiceEvent {
  kind: "invoice";
  id: string;
  entityId: string;
  amountPaise: bigint;
  issuedAtMs: number;
  dueAtMs: number;
  paidAtMs: number | null;
}

export type SimEvent = PaymentEvent | OrderEvent | SubscriptionEvent | InvoiceEvent;

export const categoryForEvent = (event: SimEvent): LeakageCategory => {
  switch (event.kind) {
    case "payment":
      return "payment_failure";
    case "order":
      return "checkout_abandonment";
    case "subscription":
      return "subscription_failure";
    case "invoice":
      return "b2b_receivable";
  }
};
