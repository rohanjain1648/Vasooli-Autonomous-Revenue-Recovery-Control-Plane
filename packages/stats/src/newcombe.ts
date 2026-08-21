import { wilsonInterval } from "./wilson.js";

export interface DiffInterval {
  diff: number;
  lower: number;
  upper: number;
}

/**
 * Newcombe (1998) hybrid score interval for the difference of two
 * independent binomial proportions p1 - p2, built from each arm's
 * individual Wilson interval.
 */
export function newcombeInterval(
  successes1: number,
  trials1: number,
  successes2: number,
  trials2: number,
  z = 1.96,
): DiffInterval {
  const w1 = wilsonInterval(successes1, trials1, z);
  const w2 = wilsonInterval(successes2, trials2, z);
  const p1 = trials1 > 0 ? successes1 / trials1 : 0;
  const p2 = trials2 > 0 ? successes2 / trials2 : 0;
  const diff = p1 - p2;
  const lower = diff - Math.sqrt((p1 - w1.lower) ** 2 + (w2.upper - p2) ** 2);
  const upper = diff + Math.sqrt((w1.upper - p1) ** 2 + (p2 - w2.lower) ** 2);
  return { diff, lower, upper };
}
