import { randomUUID } from "node:crypto";
import type { LeakageCategory } from "@vasooli/core";
import {
  EventGenerator,
  createSeededRandom,
  type RandomFn,
} from "@vasooli/simulator";
import {
  DetectorOrchestrator,
  createDetectorState,
  createPaymentDetectorState,
  makeSignal,
} from "@vasooli/detector";
import type { EngineState } from "./state.js";

const SYNTHETIC_CUSTOMERS = 40;

/**
 * Drives the whole dashboard: continuously generates payment events through
 * a seeded regime (issuer degradation on one cohort, so the CUSUM detector
 * has something real to find) and, since the simulator package only
 * generates raw *payment* events, synthesizes plausible signals directly
 * for the other three leakage categories at a lower steady rate. Every
 * emitted signal is fed through `EngineState.ingestSignal`, which runs the
 * full diagnose -> plan -> policy gate -> execute pipeline and broadcasts
 * the result over SSE.
 */
export class SignalFeed {
  private readonly generator: EventGenerator;
  private readonly detector = new DetectorOrchestrator({
    payment: createPaymentDetectorState(0.9, 20, 0.03, 0.15),
  });
  private readonly rng: RandomFn;
  private simMs: number;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly state: EngineState,
    seed = 42,
  ) {
    this.simMs = Date.now();
    this.generator = new EventGenerator({
      seed,
      startAtMs: this.simMs,
      regimes: [
        {
          name: "Demo issuer outage",
          cohort: "HDFC:card:visa",
          startMs: 0,
          endMs: Number.MAX_SAFE_INTEGER,
          successMultiplier: 0.4,
          errorCode: "issuer_down",
        },
      ],
    });
    this.rng = createSeededRandom(seed + 1);
  }

  /** Advances the simulation by one tick: a batch of payment events through
   * the real detector pipeline, plus a chance of a synthetic signal for
   * each of the other three categories. Exposed standalone (not just via
   * start()) so tests can drive it deterministically without timers. */
  async tick(): Promise<void> {
    this.simMs += 5_000;
    const batch = this.generator.batch(60);
    const paymentSignals = this.detector.run({ payments: batch }, this.simMs);
    for (const signal of paymentSignals) {
      await this.state.ingestSignal(signal, this.simMs);
    }

    for (const category of [
      "checkout_abandonment",
      "subscription_failure",
      "b2b_receivable",
    ] as const) {
      if (this.rng() < 0.35) {
        await this.state.ingestSignal(this.synthesize(category), this.simMs);
      }
    }
  }

  private synthesize(category: LeakageCategory): ReturnType<typeof makeSignal> {
    const custId = `cust_${Math.floor(this.rng() * SYNTHETIC_CUSTOMERS)}`;
    const amountPaise = BigInt(1000 + Math.floor(this.rng() * 200_000));
    const evidence: Record<string, unknown> =
      category === "checkout_abandonment"
        ? { orderId: randomUUID(), idleMs: 1_800_000 + Math.floor(this.rng() * 600_000) }
        : category === "subscription_failure"
          ? { subscriptionId: randomUUID(), errorCode: "mandate_charge_failed" }
          : { invoiceId: randomUUID(), daysOverdue: 30 + Math.floor(this.rng() * 60) };

    return makeSignal({
      category,
      entityId: custId,
      exposurePaise: amountPaise,
      nowMs: this.simMs,
      evidence,
    });
  }

  /** Starts the recurring tick loop. Errors from a tick are logged, never
   * thrown — one bad tick must not kill the whole engine process. */
  start(intervalMs = 4_000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        console.error("[signal-feed] tick failed:", err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
