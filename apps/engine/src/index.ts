import { createLlmProvider } from "@vasooli/llm";
import { createRazorpayClient } from "@vasooli/razorpay";
import { PolicyEngine, defaultRules } from "@vasooli/policy";
import { loadPlaybookCatalog } from "./playbooks.js";
import { EngineState } from "./state.js";
import { SignalFeed } from "./signal-feed.js";
import { buildServer } from "./server.js";

async function main(): Promise<void> {
  const catalog = loadPlaybookCatalog();
  const state = new EngineState({
    llmProvider: createLlmProvider(),
    razorpayClient: createRazorpayClient(),
    policyEngine: new PolicyEngine(defaultRules()),
    catalog,
    rngSeed: 1,
    holdoutPercent: 20,
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
