import { describe, it, expect } from "vitest";
import { createLlmProvider } from "./factory.js";
import { MockLlmProvider } from "./mock-adapter.js";
import { OpenaiAdapter } from "./openai-adapter.js";

describe("createLlmProvider", () => {
  it("returns MockLlmProvider when no keys are set", () => {
    const provider = createLlmProvider({} as NodeJS.ProcessEnv);
    expect(provider).toBeInstanceOf(MockLlmProvider);
  });

  it("returns OpenaiAdapter when OPENAI_API_KEY is set", () => {
    const provider = createLlmProvider({ OPENAI_API_KEY: "sk-test" } as NodeJS.ProcessEnv);
    expect(provider).toBeInstanceOf(OpenaiAdapter);
  });

  it("prefers GROQ_API_KEY over OPENAI_API_KEY when both are set", () => {
    const provider = createLlmProvider({
      GROQ_API_KEY: "gsk-test",
      OPENAI_API_KEY: "sk-test",
    } as NodeJS.ProcessEnv);
    expect(provider).toBeInstanceOf(OpenaiAdapter);
  });
});
