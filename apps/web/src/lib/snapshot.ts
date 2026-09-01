import type { ExperimentCohort, MetricsSnapshot } from "./api";

/**
 * The output of a real `pnpm demo` run (seed 1, 60 ticks), committed
 * verbatim from demo/output/metrics.json.
 *
 * It is the fallback whenever the engine is not reachable — a static
 * hosting target, or a reviewer opening the link before starting the
 * API. The UI always labels which of the two it is showing; a seeded
 * batch is never presented as a live one.
 */
export const SEEDED_METRICS: MetricsSnapshot = {
  detected: 113,
  recovered: 30,
  blocked: 0,
  deferred: 0,
  grossPaise: "16768952",
  treatment: {
    n: 92,
    inFlight: 0,
    successes: 28,
    successRate: 0.30434782608695654,
    recoveredPaise: "16606857",
  },
  holdout: {
    n: 21,
    inFlight: 0,
    successes: 2,
    successRate: 0.09523809523809523,
    recoveredPaise: "162095",
  },
  incrementalPaise: "11806130",
  ciWidthPaise: "9404521",
  pValue: 0.5594771784659526,
  upliftRateDiff: 0.2091097308488613,
  upliftRateLower: -0.0024545523670626568,
  upliftRateUpper: 0.3306904699018058,
};

export const SEEDED_EXPERIMENTS: ExperimentCohort[] = [
  {
    category: "payment_failure",
    treatment: { n: 37, inFlight: 0, successes: 12, successRate: 0.32432432432432434, recoveredPaise: "14835000" },
    holdout: { n: 8, inFlight: 0, successes: 0, successRate: 0, recoveredPaise: "0" },
    uplift: { pValue: 0.7406012622043201, diff: 0.32432432432432434, statistic: 1.3502542475064212, n: 45 },
    rateInterval: { diff: 0.32432432432432434, lower: -0.02442751012248978, upper: 0.48536631495176064 },
  },
  {
    category: "checkout_abandonment",
    treatment: { n: 20, inFlight: 0, successes: 7, successRate: 0.35, recoveredPaise: "806655" },
    holdout: { n: 2, inFlight: 0, successes: 0, successRate: 0, recoveredPaise: "0" },
    uplift: { pValue: 1, diff: 0.35, statistic: 0.9797, n: 22 },
    rateInterval: { diff: 0.35, lower: -0.1466, upper: 0.5619 },
  },
  {
    category: "b2b_receivable",
    treatment: { n: 19, inFlight: 0, successes: 6, successRate: 0.3157894736842105, recoveredPaise: "544088" },
    holdout: { n: 4, inFlight: 0, successes: 0, successRate: 0, recoveredPaise: "0" },
    uplift: { pValue: 0.9554, diff: 0.3157894736842105, statistic: 1.0466, n: 23 },
    rateInterval: { diff: 0.3157894736842105, lower: -0.0813, upper: 0.5217 },
  },
  {
    category: "subscription_failure",
    treatment: { n: 16, inFlight: 0, successes: 3, successRate: 0.1875, recoveredPaise: "421114" },
    holdout: { n: 7, inFlight: 0, successes: 2, successRate: 0.2857142857142857, recoveredPaise: "162095" },
    uplift: { pValue: 1, diff: -0.0982142857142857, statistic: 0.9092497248994454, n: 23 },
    rateInterval: { diff: -0.0982142857142857, lower: -0.47379556075301243, upper: 0.2184286235276165 },
  },
];

export const SEEDED_LEDGER_ENTRIES = 731;
