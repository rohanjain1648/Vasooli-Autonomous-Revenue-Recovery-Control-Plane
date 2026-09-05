import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { createLlmProvider } from "@vasooli/llm";
import { createRazorpayClient } from "@vasooli/razorpay";
import { PolicyEngine, defaultRules, confidenceLadderRule, preDebitNotificationRule } from "@vasooli/policy";
import { loadPlaybookCatalog } from "./playbooks.js";
import { EngineState } from "./state.js";
import { SignalFeed } from "./signal-feed.js";
import { buildServer } from "./server.js";

// The standalone server is the one place credentials matter (the demo
// script deliberately never loads them — see MockLlmProvider's own doc
// comment on why demos stay offline and reproducible). .env lives at the
// repo root, not here, so pnpm's per-package cwd can't find it on its
// own; resolve relative to this file instead of relying on cwd. Safe to
// do before createLlmProvider() etc. are called below — those only read
// process.env when main() actually runs them, not at import time.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

async function main(): Promise<void> {
  const catalog = loadPlaybookCatalog();
  // RBI's real pre-debit notice window is 24h; a live demo compresses it
  // to something actually watchable. Both the rule's minimum wait and
  // EngineState's own "when to send the notice" scheduling read the exact
  // same number so the two halves of the wait stay lined up — see
  // EngineConfig.promiseRetryNoticeMs's doc comment.
  const promiseRetryNoticeMs = 90_000;
  const state = new EngineState({
    llmProvider: createLlmProvider(),
    razorpayClient: createRazorpayClient(),
    // The confidence ladder only makes sense somewhere a viewer can watch
    // it earn autonomy live over minutes — it's deliberately absent from
    // defaultRules() (see that rule's own doc comment) and from the
    // seeded pnpm demo batch, which auto-approves everything at the end
    // regardless of why it parked. Same reasoning for the pre-debit
    // notification rule below.
    policyEngine: new PolicyEngine([
      ...defaultRules(),
      confidenceLadderRule(),
      preDebitNotificationRule(promiseRetryNoticeMs),
    ]),
    catalog,
    rngSeed: 1,
    holdoutPercent: 20,
    promiseRetryNoticeMs,
  });

  const feed = new SignalFeed(state);
  feed.start();

  const fastify = await buildServer(state);
  const port = Number(process.env.PORT ?? 4000);
  await fastify.listen({ port, host: "0.0.0.0" });
  console.log(`[vasooli-engine] listening on :${port}`);
  console.log(`[vasooli-engine] loaded ${catalog.playbooks.length} playbooks, ${catalog.arms.length} arms`);

  const shutdown = async () => {
    feed.stop();
    await fastify.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[vasooli-engine] fatal:", err);
  process.exit(1);
});
