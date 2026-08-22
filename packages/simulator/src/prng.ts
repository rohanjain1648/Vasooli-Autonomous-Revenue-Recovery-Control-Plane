export type RandomFn = () => number;

/** Deterministic PRNG (mulberry32) — mirrors packages/stats/src/thompson.ts so
 * simulator runs are reproducible and replayable across the whole system. */
export function createSeededRandom(seed: number): RandomFn {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
