export type RandomFn = () => number;

/** Deterministic PRNG (mulberry32) — same construction used across
 * packages/stats and packages/simulator, kept consistent so any seeded
 * run of the whole system is fully reproducible end to end. */
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
