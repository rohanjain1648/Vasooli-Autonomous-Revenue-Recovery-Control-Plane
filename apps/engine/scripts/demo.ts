#!/usr/bin/env -S node --loader tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSeededRandom } from "@vasooli/stats";
import { MockLlmProvider } from "@vasooli/llm";
import { FakeRazorpayClient } from "@vasooli/razorpay";
import { PolicyEngine, defaultRules } from "@vasooli/policy";
import { loadPlaybookCatalog } from "../src/playbooks.js";
import { EngineState } from "../src/state.js";
import { computeMetricsSnapshot, computeExperimentsSnapshot } from "../src/metrics.js";
import { SignalFeed } from "../src/signal-feed.js";
import { toJsonSafe } from "../src/serialize.js";

/**
 * `pnpm demo`: a fully offline, seeded, deterministic batch run of the
 * whole pipeline — no server, no browser, no network calls. This is what
 * a reviewer runs to see "measured incremental ₹" fall out of the system
 * end to end (design spec §12, Day 13's "seeded pnpm demo batch script").
 * Re-running with the same TICKS/SEED always prints the same numbers.
 */

const SEED = 1;
const TICKS = 60;
/** Fixed sim start at local noon (well outside TRAI quiet hours,
 * 21:00-09:00 — see @vasooli/policy's traiQuietHoursRule) so even ledger
 * timestamps are byte-identical across replays, not just the money
 * numbers, and the batch isn't dominated by policy-deferred cases. */
const START_AT_MS = new Date(2026, 0, 1, 12, 0, 0).getTime();

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "..", "..", "demo", "output");

function rupees(paise: string | bigint): string {
  const n = typeof paise === "bigint" ? paise : BigInt(paise);
  return `₹${(Number(n) / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

function bar(width: number, filled: number): string {
  const n = Math.max(0, Math.min(width, Math.round(width * filled)));
  return "█".repeat(n) + "░".repeat(width - n);
}

/** A deterministic, UUID-v4-shaped id generator seeded from SEED. Every
 * random decision downstream of a case id (arm assignment, simulated
 * outcome, bandit draw — see OrchestratorDeps.caseIdFactory) is a hash
 * function of that id, so pinning this one generator makes the entire
 * batch run byte-for-byte reproducible across invocations. Node's own
 * randomUUID() is cryptographically random and cannot be seeded, which is
 * exactly right for production but wrong for a demo that must replay. */
function seededUuidFactory(seed: number): () => string {
  const rng = createSeededRandom(seed);
  return () => {
    const hex = () => Math.floor(rng() * 16).toString(16);
    const bytes = Array.from({ length: 32 }, hex).join("");
    const withVersion = `${bytes.slice(0, 12)}4${bytes.slice(13, 16)}`;
    const variant = ((parseInt(bytes[16], 16) & 0x3) | 0x8).toString(16);
    const withVariant = `${withVersion.slice(0, 16)}${variant}${withVersion.slice(17)}`;
    return [
      withVariant.slice(0, 8),
      withVariant.slice(8, 12),
      withVariant.slice(12, 16),
      withVariant.slice(16, 20),
      withVariant.slice(20, 32),
    ].join("-");
  };
}

async function main(): Promise<void> {
  console.log("");
  console.log("  VASOOLI — seeded offline demo batch");
  console.log(`  seed=${SEED}  ticks=${TICKS}  (deterministic — re-run for identical output)`);
  console.log("");

  const catalog = loadPlaybookCatalog();
  const state = new EngineState({
    llmProvider: new MockLlmProvider(),
    razorpayClient: new FakeRazorpayClient({ seed: SEED }),
    policyEngine: new PolicyEngine(defaultRules()),
    catalog,
    rngSeed: SEED,
    holdoutPercent: 20,
    caseIdFactory: seededUuidFactory(SEED),
  });

  const feed = new SignalFeed(state, SEED, START_AT_MS);
  for (let i = 0; i < TICKS; i++) {
    await feed.tick();
    process.stdout.write(`\r  simulating… tick ${i + 1}/${TICKS} (${state.cases.size} cases so far)`);
  }
  console.log("");

  // Resolve every case still parked on a human decision so the batch
  // reaches a clean final state — in the live dashboard a person does
  // this; here we auto-approve to show the full loop completing.
  const pending = state.listApprovals();
  for (const record of pending) {
    await state.approve(record.case.id);
  }
  console.log(`  auto-approved ${pending.length} case(s) that were awaiting human sign-off`);
  console.log("");

  const metrics = computeMetricsSnapshot(state);
  const audit = state.auditLog(true);
  const experiments = computeExperimentsSnapshot(state);

  console.log("  ── Money Wall ──────────────────────────────────────────────");
  console.log(`  Gross recovered:        ${rupees(metrics.grossPaise)}`);
  console.log(
    `  Incremental (95% CI):   ${rupees(metrics.incrementalPaise)} ± ${rupees(metrics.ciWidthPaise)}  (p=${metrics.pValue.toFixed(3)})`,
  );
  console.log(
    `  Treatment recovery:     ${pct(metrics.treatment.successRate)}  (n=${metrics.treatment.n})   ${bar(24, metrics.treatment.successRate)}`,
  );
  console.log(
    `  Holdout recovery:       ${pct(metrics.holdout.successRate)}  (n=${metrics.holdout.n})   ${bar(24, metrics.holdout.successRate)}`,
  );
  console.log(`  Cases detected:         ${metrics.detected}`);
  console.log(`  Cases recovered:        ${metrics.recovered}`);
  console.log(`  Policy blocked:         ${metrics.blocked}`);
  console.log(`  Deferred (quiet hours): ${metrics.deferred}`);
  console.log("");

  console.log("  ── Per-category uplift ─────────────────────────────────────");
  for (const c of experiments) {
    console.log(
      `  ${c.category.padEnd(22)} treatment ${pct(c.treatment.successRate).padStart(6)} (n=${c.treatment.n})  vs  holdout ${pct(c.holdout.successRate).padStart(6)} (n=${c.holdout.n})  p=${c.uplift.pValue.toFixed(3)}`,
    );
  }
  console.log("");

  console.log("  ── Audit ledger ────────────────────────────────────────────");
  console.log(`  Entries: ${audit.entries.length}`);
  console.log(`  Hash chain valid: ${audit.valid ? "✓ yes — no tampering detected" : "✗ TAMPERED"}`);
  console.log("");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(join(OUTPUT_DIR, "metrics.json"), JSON.stringify(toJsonSafe(metrics), null, 2));
  writeFileSync(join(OUTPUT_DIR, "experiments.json"), JSON.stringify(toJsonSafe(experiments), null, 2));
  writeFileSync(join(OUTPUT_DIR, "ledger.json"), JSON.stringify(toJsonSafe(audit.entries), null, 2));
  console.log(`  Wrote metrics.json, experiments.json, ledger.json to demo/output/`);
  console.log("");
}

main().catch((err) => {
  console.error("[demo] fatal:", err);
  process.exit(1);
});
