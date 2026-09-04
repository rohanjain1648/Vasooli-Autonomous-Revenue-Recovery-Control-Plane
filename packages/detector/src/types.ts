import type { RiskSignal } from "@vasooli/core";
import type {
  PaymentEvent,
  OrderEvent,
  SubscriptionEvent,
  InvoiceEvent,
} from "@vasooli/simulator";

export type { RiskSignal };

/** Rolling per-cohort payment stats used by the degradation detector. */
export interface CohortStats {
  cohort: string;
  totalPayments: number;
  capturedPayments: number;
  failedPayments: number;
  /** Ring buffer of recent per-window success rates fed to CUSUM. */
  windowSuccessRates: number[];
  /** Tally of failure error codes seen in the current window, reset
   * alongside windowSuccessRates. Lets a fired signal report *which*
   * failure mode dominates the outage, not just that one exists. */
  errorCodeTally: Map<string, number>;
}

export interface PaymentDetectorState {
  cohorts: Map<string, CohortStats>;
  baselineSuccessRate: number;
  windowSize: number; // events per rolling window
  cusumK: number;
  cusumH: number;
}

export function createPaymentDetectorState(
  baselineSuccessRate = 0.9,
  windowSize = 50,
  cusumK = 0.03,
  cusumH = 0.15,
): PaymentDetectorState {
  return {
    cohorts: new Map(),
    baselineSuccessRate,
    windowSize,
    cusumK,
    cusumH,
  };
}

export interface DetectorState {
  payment: PaymentDetectorState;
}

export function createDetectorState(): DetectorState {
  return { payment: createPaymentDetectorState() };
}

export interface DetectorEvents {
  payments?: PaymentEvent[];
  orders?: OrderEvent[];
  subscriptions?: SubscriptionEvent[];
  invoices?: InvoiceEvent[];
}
