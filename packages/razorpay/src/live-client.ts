import type {
  DiscountResult,
  NotificationResult,
  PaymentStatus,
  RazorpayClient,
  RefundResult,
} from "./client.js";

export interface LiveRazorpayClientOptions {
  keyId: string;
  keySecret: string;
  baseUrl?: string;
}

/**
 * Thin live client over the real Razorpay REST API (test-mode credentials
 * during the buildathon). Implements the same RazorpayClient interface as
 * the fake so the executor never needs to know which one it's talking to.
 */
export class LiveRazorpayClient implements RazorpayClient {
  private readonly authHeader: string;
  private readonly baseUrl: string;

  constructor(options: LiveRazorpayClientOptions) {
    this.authHeader = `Basic ${Buffer.from(`${options.keyId}:${options.keySecret}`).toString("base64")}`;
    this.baseUrl = options.baseUrl ?? "https://api.razorpay.com/v1";
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: this.authHeader,
        ...init.headers,
      },
    });
    if (!response.ok) {
      throw new Error(`Razorpay API error: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
  }

  async applyRefund(paymentId: string, amountPaise: bigint): Promise<RefundResult> {
    const body = await this.request<{ id: string; status: string }>(
      `/payments/${paymentId}/refund`,
      { method: "POST", body: JSON.stringify({ amount: Number(amountPaise) }) },
    );
    return {
      id: body.id,
      paymentId,
      amountPaise,
      status: body.status === "processed" ? "processed" : "pending",
    };
  }

  async applyDiscount(
    customerId: string,
    discountPaise: bigint,
    expiresAt: Date,
  ): Promise<DiscountResult> {
    // Razorpay has no first-class "discount" primitive; this is modeled as
    // a coupon/offer applied at the merchant's checkout layer. Left as an
    // integration point for a real merchant's offer system.
    throw new Error(
      "LiveRazorpayClient.applyDiscount is a merchant-specific integration point, not implemented for this demo",
    );
  }

  async sendNotification(
    customerId: string,
    channel: "sms" | "email" | "voice",
    content: string,
  ): Promise<NotificationResult> {
    // Real SMS/WhatsApp/voice delivery is out of scope per design spec §13;
    // this logs the payload a real provider integration would send.
    throw new Error(
      "LiveRazorpayClient.sendNotification requires a configured SMS/email/voice provider — out of scope for this demo",
    );
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    const body = await this.request<{ status: PaymentStatus }>(`/payments/${paymentId}`, {
      method: "GET",
    });
    return body.status;
  }
}
