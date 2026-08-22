export type PaymentStatus = "created" | "authorized" | "captured" | "failed" | "refunded";

export interface RefundResult {
  id: string;
  paymentId: string;
  amountPaise: bigint;
  status: "processed" | "pending";
}

export interface DiscountResult {
  id: string;
  customerId: string;
  discountPaise: bigint;
  expiresAt: string; // ISO datetime
}

export interface NotificationResult {
  id: string;
  customerId: string;
  channel: "sms" | "email" | "voice";
  status: "sent" | "queued";
}

/**
 * Razorpay client abstraction. Every money-moving or customer-facing
 * operation the executor can call goes through this interface, with a
 * live implementation and an in-memory fake behind the same shape — see
 * design spec §11 (offline-first operation).
 */
export interface RazorpayClient {
  applyRefund(paymentId: string, amountPaise: bigint): Promise<RefundResult>;
  applyDiscount(
    customerId: string,
    discountPaise: bigint,
    expiresAt: Date,
  ): Promise<DiscountResult>;
  sendNotification(
    customerId: string,
    channel: "sms" | "email" | "voice",
    content: string,
  ): Promise<NotificationResult>;
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>;
}
