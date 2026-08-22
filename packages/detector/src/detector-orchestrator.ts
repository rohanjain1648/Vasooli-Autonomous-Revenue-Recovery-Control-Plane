import type { DetectorState, DetectorEvents, RiskSignal } from "./types.js";
import { createDetectorState } from "./types.js";
import { detectPaymentDegradation } from "./payment-degradation.js";
import { detectCheckoutAbandonment } from "./checkout-abandonment.js";
import { detectSubscriptionFailure } from "./subscription-failure.js";
import { detectB2bReceivables } from "./b2b-receivables.js";

/**
 * Runs all four detectors over a batch of events at a given point in
 * simulated/real time. Stateful only for the payment-degradation detector
 * (rolling cohort windows carried in `state.payment`); the other three are
 * pure snapshot evaluations of whatever records are passed in.
 */
export class DetectorOrchestrator {
  private state: DetectorState;

  constructor(state: DetectorState = createDetectorState()) {
    this.state = state;
  }

  run(events: DetectorEvents, nowMs: number): RiskSignal[] {
    const signals: RiskSignal[] = [];

    if (events.payments?.length) {
      signals.push(
        ...detectPaymentDegradation(this.state.payment, events.payments, nowMs),
      );
    }
    if (events.orders?.length) {
      signals.push(...detectCheckoutAbandonment(events.orders, nowMs));
    }
    if (events.subscriptions?.length) {
      signals.push(...detectSubscriptionFailure(events.subscriptions, nowMs));
    }
    if (events.invoices?.length) {
      signals.push(...detectB2bReceivables(events.invoices, nowMs));
    }

    return signals;
  }

  getState(): DetectorState {
    return this.state;
  }
}
