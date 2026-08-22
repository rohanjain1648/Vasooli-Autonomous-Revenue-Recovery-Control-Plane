export interface AlwaysValidResult {
  pValue: number;
  diff: number;
  statistic: number;
  n: number;
}

/**
 * Always-valid p-value via a normal-mixture sequential probability ratio
 * test (mSPRT), per Johari, Koomen, Pekelis & Walsh (2017), "Peeking at
 * A/B Tests". Safe to evaluate after every new observation without
 * inflating the false-positive rate — the property spec §5 calls
 * "no peeking problem".
 *
 * `diffs` is the running list of per-observation statistic contributions.
 * `perObservationVariance` (sigma^2) is the variance of a single
 * observation under the null. `mixingVariance` (tau^2) is the prior
 * variance on the effect size under the mixture — larger tau^2 detects
 * large effects sooner at the cost of power against small ones.
 */
export function alwaysValidPValue(
  diffs: number[],
  perObservationVariance: number,
  mixingVariance: number,
): AlwaysValidResult {
  const n = diffs.length;
  if (n === 0) {
    return { pValue: 1, diff: 0, statistic: 0, n: 0 };
  }
  const sum = diffs.reduce((a, b) => a + b, 0);
  const sigma2 = perObservationVariance;
  const tau2 = mixingVariance;
  const denom = sigma2 + n * tau2;
  const logLambda =
    0.5 * Math.log(sigma2 / denom) + (tau2 * sum * sum) / (2 * sigma2 * denom);
  const lambda = Math.exp(logLambda);
  const pValue = Math.min(1, 1 / lambda);
  const diff = diffs.length > 0 ? diffs[0] : 0;
  return { pValue, diff, statistic: lambda, n };
}

/**
 * Two-arm proportion comparison built on `alwaysValidPValue`: treats the
 * observed treatment/holdout recovery-rate difference as a single
 * aggregated normal statistic (valid by the CLT on proportions) and
 * evaluates it as one mixture-test observation.
 */
export function sequentialUpliftTest(
  treatmentSuccesses: number,
  treatmentTrials: number,
  holdoutSuccesses: number,
  holdoutTrials: number,
  mixingVariance = 0.01,
): AlwaysValidResult {
  const n = treatmentTrials + holdoutTrials;
  if (treatmentTrials === 0 || holdoutTrials === 0) {
    return { pValue: 1, diff: 0, statistic: 0, n };
  }
  const pT = treatmentSuccesses / treatmentTrials;
  const pH = holdoutSuccesses / holdoutTrials;
  const diff = pT - pH;

  // Use pooled variance under H₀: p̂ = (sT+sH)/(nT+nH)
  const pPooled = (treatmentSuccesses + holdoutSuccesses) / (treatmentTrials + holdoutTrials);
  const sigma2 = pPooled * (1 - pPooled) * (1 / treatmentTrials + 1 / holdoutTrials);

  // Guard against zero variance (all-success, all-failure, or no data)
  if (sigma2 <= 0) {
    return { pValue: 1, diff, statistic: 0, n };
  }

  const result = alwaysValidPValue([diff], sigma2, mixingVariance);
  return { ...result, n };
}
