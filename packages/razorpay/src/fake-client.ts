import { createSeededRandom, type RandomFn } from "./prng.js";
import type {
  DiscountResult,
  NotificationResult,
  PaymentStatus,
  RazorpayClient,
  RefundResult,
} from "./client.js";

export interface FakeRazorpayClientOptions {
  seed?: number;
  /** When true, actually sleeps to simulate network latency. Default
   * false so tests run instantly; demos can enable it for realism. */
  simulateLatency?: boolean;
  maxLatencyMs?: number;
}

/**
 * In-memory Razorpay fake: deterministic (seeded) IDs and responses shaped
 * exactly like the live API, with no network calls. This is what the
 * executor talks to whenever RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are
 * absent from the environment (design spec §11).
 */
export class FakeRazorpayClient implements RazorpayClient {
  private readonly rng: RandomFn;
  private readonly simulateLatency: boolean;
  private readonly maxLatencyMs: number;
  private counter = 0;
  private readonly paymentStatuses = new Map<string, PaymentStatus>();

  constructor(options: FakeRazorpayClientOptions = {}) {
    this.rng = createSeededRandom(options.seed ?? 1);
    this.simulateLatency = options.simulateLatency ?? false;
    this.maxLatencyMs = options.maxLatencyMs ?? 300;
  }

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_fake_${this.counter}`;
  }

  private async latency(): Promise<void> {
    if (!this.simulateLatency) return;
    const ms = Math.floor(this.rng() * this.maxLatencyMs);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async applyRefund(paymentId: string, amountPaise: bigint): Promise<RefundResult> {
    await this.latency();
    this.paymentStatuses.set(paymentId, "refunded");
    return {
      id: this.nextId("rfnd"),
      paymentId,
      amountPaise,
      status: "processed",
    };
  }

  async applyDiscount(
    customerId: string,
    discountPaise: bigint,
    expiresAt: Date,
  ): Promise<DiscountResult> {
    await this.latency();
    return {
      id: this.nextId("disc"),
      customerId,
      discountPaise,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async sendNotification(
    customerId: string,
    channel: "sms" | "email" | "voice",
    _content: string,
  ): Promise<NotificationResult> {
    await this.latency();
    return {
      id: this.nextId("notif"),
      customerId,
      channel,
      status: "sent",
    };
  }

  async getPaymentStatus(paymentId: string): Promise<PaymentStatus> {
    await this.latency();
    return this.paymentStatuses.get(paymentId) ?? "created";
  }

  /** Test/demo helper: seed a known status for a payment id. */
  _setPaymentStatus(paymentId: string, status: PaymentStatus): void {
    this.paymentStatuses.set(paymentId, status);
  }
}
