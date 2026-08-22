#!/usr/bin/env -S node --loader tsx
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { MockLlmProvider } from "@vasooli/llm";
import { loadPlaybookCatalog } from "../src/playbooks.js";

/**
 * Day 13 deliverable: renders the Hinglish IVR recovery script (see
 * playbooks/phone-ivr.yaml's "ivr-reminder" arm) with realistic demo
 * variables, using the exact same content-generation path the executor
 * uses in production (LlmProvider.generateContent — read-only, template
 * substitution only, never the LLM picking the arm). Writes plain text
 * here; scripts/render-ivr-audio.ps1 turns it into a .wav file using
 * Windows' offline SAPI TTS engine — no live telephony, no network call,
 * per design spec §13's explicit out-of-scope boundary.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, "..", "..", "..", "demo", "audio");

async function main(): Promise<void> {
  const catalog = loadPlaybookCatalog();
  const arm = catalog.arms.find((a) => a.id === "phone-ivr-v1:ivr-reminder");
  if (!arm) throw new Error("phone-ivr-v1:ivr-reminder arm not found in playbook catalog");

  const llm = new MockLlmProvider();
  const script = await llm.generateContent(arm, {
    customer_name: "Rohan",
    merchant_name: "Vasooli Demo Merchant",
    amount: "2,450.00",
    error_reason: "aapke card ka daily limit exceed ho gaya tha",
    retry_link: "pay.example/retry/demo-case-001",
    support_number: "1800-123-4567",
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const outPath = join(OUTPUT_DIR, "hinglish-ivr-script.txt");
  writeFileSync(outPath, script, "utf8");
  console.log(`Rendered IVR script -> ${outPath}`);
  console.log("");
  console.log(script);
}

main().catch((err) => {
  console.error("[render-ivr-script] fatal:", err);
  process.exit(1);
});
