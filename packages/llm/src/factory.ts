import type { LlmProvider } from "./provider.js";
import { MockLlmProvider } from "./mock-adapter.js";
import { OpenaiAdapter } from "./openai-adapter.js";

/**
 * Selects the live adapter when a key is present in the environment,
 * falling back to the deterministic mock otherwise. This is the single
 * switch that lets the whole system run demo-safe offline by default
 * (design spec §11) — dropping OPENAI_API_KEY or GROQ_API_KEY into .env
 * flips this to live with no code changes anywhere else.
 */
export function createLlmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const groqKey = env.GROQ_API_KEY;
  if (groqKey) {
    return new OpenaiAdapter({
      apiKey: groqKey,
      baseUrl: "https://api.groq.com/openai/v1",
      // llama-3.3-70b-versatile was decommissioned from Groq's catalog at
      // some point after this default was written (confirmed live against
      // Groq's /v1/models — it's simply gone). gpt-oss-20b is Groq's
      // current general-purpose model, verified against the exact prompt
      // shape diagnose() sends.
      model: env.GROQ_MODEL ?? "openai/gpt-oss-20b",
    });
  }
  const openaiKey = env.OPENAI_API_KEY;
  if (openaiKey) {
    return new OpenaiAdapter({ apiKey: openaiKey, model: env.OPENAI_MODEL });
  }
  return new MockLlmProvider();
}
