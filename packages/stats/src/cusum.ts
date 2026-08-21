export interface CusumResult {
  changePointIndex: number | null;
  finalUpper: number;
  finalLower: number;
}

/**
 * Two-sided CUSUM change-point detector over a sequence of observations
 * (e.g. per-window success rates) relative to a known baseline mean.
 * `k` is the allowance (slack), typically half the shift magnitude you
 * want to detect; `h` is the decision threshold (control limit).
 */
export function cusum(
  observations: number[],
  baselineMean: number,
  k: number,
  h: number,
): CusumResult {
  let upper = 0;
  let lower = 0;
  let changePointIndex: number | null = null;

  for (let i = 0; i < observations.length; i++) {
    const deviation = observations[i] - baselineMean;
    upper = Math.max(0, upper + deviation - k);
    lower = Math.max(0, lower - deviation - k);
    if (changePointIndex === null && (upper > h || lower > h)) {
      changePointIndex = i;
    }
  }

  return { changePointIndex, finalUpper: upper, finalLower: lower };
}
