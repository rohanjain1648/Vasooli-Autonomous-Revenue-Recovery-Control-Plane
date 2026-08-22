import { createSeededRandom, type RandomFn } from "./prng.js";
import { applyRegimes, activeRegimeErrorCode, type DegradationRegime } from "./degradation.js";
import type { PaymentEvent } from "./events.js";

const COHORTS = [
  "HDFC:card:visa",
  "HDFC:card:mastercard",
  "ICICI:upi:default",
  "SBI:netbanking:default",
];

const NORMAL_ERROR_CODES = [
  "insufficient_funds",
  "card_expired",
  "authentication_failed",
  "limit_exceeded",
];

export interface EventGeneratorOptions {
  seed: number;
  baselineSuccessRate?: number; // default 0.92
  startAtMs?: number; // default Date.now()
  regimes?: DegradationRegime[];
  minAmountPaise?: bigint;
  maxAmountPaise?: bigint;
}

/**
 * Deterministic payment-event stream generator. Given the same seed and
 * options, `next()` produces byte-identical events across runs — this is
 * what makes simulator-driven demos and tests reproducible/replayable.
 */
export class EventGenerator {
  private rng: RandomFn;
  private counter = 0;
  private readonly baselineSuccessRate: number;
  private readonly startAtMs: number;
  private readonly regimes: DegradationRegime[];
  private readonly minAmountPaise: bigint;
  private readonly maxAmountPaise: bigint;

  constructor(options: EventGeneratorOptions) {
    this.rng = createSeededRandom(options.seed);
    this.baselineSuccessRate = options.baselineSuccessRate ?? 0.92;
    this.startAtMs = options.startAtMs ?? 0;
    this.regimes = options.regimes ?? [];
    this.minAmountPaise = options.minAmountPaise ?? 10_00n; // ₹10
    this.maxAmountPaise = options.maxAmountPaise ?? 50_000_00n; // ₹50,000
  }

  /** Produces the next event in the deterministic stream. Advances
   * simulated time by a small random increment (Poisson-ish gaps). */
  next(): PaymentEvent {
    const gapMs = Math.floor(this.rng() * 60_000); // up to 1 minute between events
    this.counter += 1;
    const timestampMs = this.startAtMs + this.counter * gapMs;

    const cohort = COHORTS[Math.floor(this.rng() * COHORTS.length)];
    const effectiveRate = applyRegimes(
      cohort,
      timestampMs,
      this.baselineSuccessRate,
      this.regimes,
    );
    const success = this.rng() < effectiveRate;

    const range = this.maxAmountPaise - this.minAmountPaise;
    const amountPaise =
      this.minAmountPaise + BigInt(Math.floor(this.rng() * Number(range)));

    let errorCode: string | null = null;
    if (!success) {
      const injected = activeRegimeErrorCode(cohort, timestampMs, this.regimes);
      errorCode =
        injected ?? NORMAL_ERROR_CODES[Math.floor(this.rng() * NORMAL_ERROR_CODES.length)];
    }

    return {
      kind: "payment",
      id: `pay_${this.counter}`,
      entityId: `cust_${Math.floor(this.rng() * 1000)}`,
      cohort,
      amountPaise,
      success,
      errorCode,
      timestampMs,
    };
  }

  /** Convenience: generate `count` events at once. */
  batch(count: number): PaymentEvent[] {
    const out: PaymentEvent[] = [];
    for (let i = 0; i < count; i++) out.push(this.next());
    return out;
  }
}
