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
      model: env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
    });
  }
  const openaiKey = env.OPENAI_API_KEY;
  if (openaiKey) {
    return new OpenaiAdapter({ apiKey: openaiKey, model: env.OPENAI_MODEL });
  }
  return new MockLlmProvider();
}
