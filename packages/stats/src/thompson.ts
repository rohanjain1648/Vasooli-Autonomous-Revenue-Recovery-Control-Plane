export interface Arm {
  id: string;
  alpha: number;
  beta: number;
}

export type RandomFn = () => number;

/** Deterministic PRNG (mulberry32) so bandit behavior is reproducible in tests and replays. */
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

function sampleStandardNormal(rng: RandomFn): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia-Tsang method for sampling Gamma(shape, 1). */
function sampleGamma(shape: number, rng: RandomFn): number {
  if (shape < 1) {
    const u = rng();
    return sampleGamma(shape + 1, rng) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number;
    let v: number;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function sampleBeta(alpha: number, beta: number, rng: RandomFn): number {
  const x = sampleGamma(alpha, rng);
  const y = sampleGamma(beta, rng);
  return x / (x + y);
}

/**
 * Thompson sampling arm selection: draw one Beta(alpha, beta) sample per
 * arm and return the id of the arm with the highest draw.
 */
export function selectArm(arms: Arm[], rng: RandomFn): string {
  if (arms.length === 0) {
    throw new Error("selectArm requires at least one arm");
  }
  let bestId = arms[0].id;
  let bestDraw = -Infinity;
  for (const arm of arms) {
    const draw = sampleBeta(arm.alpha, arm.beta, rng);
    if (draw > bestDraw) {
      bestDraw = draw;
      bestId = arm.id;
    }
  }
  return bestId;
}

/** Posterior update after observing a binary outcome for an arm. */
export function updateArm(arm: Arm, success: boolean): Arm {
  return success
    ? { ...arm, alpha: arm.alpha + 1 }
    : { ...arm, beta: arm.beta + 1 };
}
