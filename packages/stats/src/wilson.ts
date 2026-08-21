export interface Interval {
  point: number;
  lower: number;
  upper: number;
}

/**
 * Wilson score interval for a binomial proportion (Wilson, 1927).
 * `z` defaults to 1.96 (95% confidence).
 */
export function wilsonInterval(
  successes: number,
  trials: number,
  z = 1.96,
): Interval {
  if (trials <= 0) {
    return { point: 0, lower: 0, upper: 0 };
  }
  const p = successes / trials;
  const z2 = z * z;
  const denominator = 1 + z2 / trials;
  const center = p + z2 / (2 * trials);
  const margin =
    z * Math.sqrt((p * (1 - p)) / trials + z2 / (4 * trials * trials));
  return {
    point: p,
    lower: Math.max(0, (center - margin) / denominator),
    upper: Math.min(1, (center + margin) / denominator),
  };
}
