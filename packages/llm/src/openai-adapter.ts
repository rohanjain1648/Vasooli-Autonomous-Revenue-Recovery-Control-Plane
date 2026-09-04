import type { RiskSignal } from "@vasooli/core";
import type { DiagnosisOutput, LlmProvider, PlaybookArm } from "./provider.js";
import { isValidDiagnosis } from "./provider.js";

/** RiskSignal.exposurePaise (and possibly fields inside its `evidence`
 * bag) are bigints — plain JSON.stringify throws on those natively. This
 * is a one-way serialization for a prompt, never deserialized back into
 * a bigint, so a plain string coercion is correct (contrast with
 * @vasooli/core's MoneyPaiseJson, which round-trips). */
function stringifySignal(signal: RiskSignal): string {
  return JSON.stringify(signal, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
}

export interface OpenaiAdapterOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string; // override for Groq/OpenAI-compatible endpoints
}

const DIAGNOSIS_SYSTEM_PROMPT = `You are a read-only revenue-recovery diagnosis agent.
Given a risk signal, respond with ONLY a JSON object matching this shape:
{"rootCause": string, "confidence": number (0-1), "evidenceCode": string, "recommendedSegment": "high_value"|"standard"|"at_risk"}
Do not include markdown fences or any other text.`;

/**
 * Live provider: OpenAI or any OpenAI-compatible endpoint (Groq, etc).
 * Requires a real API key — flips on automatically when
 * OPENAI_API_KEY/GROQ_API_KEY is present in the environment (see design
 * spec §11). Every response is Zod-shape-validated before being trusted;
 * an invalid or unparseable response throws rather than silently
 * defaulting, since a bad diagnosis must never reach the policy gate.
 */
export class OpenaiAdapter implements LlmProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;

  constructor(options: OpenaiAdapterOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "gpt-4o-mini";
    this.baseUrl = options.baseUrl ?? "https://api.openai.com/v1";
  }

  async diagnose(signal: RiskSignal): Promise<DiagnosisOutput> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: DIAGNOSIS_SYSTEM_PROMPT },
          { role: "user", content: stringifySignal(signal) },
        ],
        temperature: 0,
      }),
    });

    if (!response.ok) {
      throw new Error(`LLM diagnose request failed: ${response.status} ${response.statusText}`);
    }

    const body = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    const raw = body.choices[0]?.message.content ?? "";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`LLM diagnosis was not valid JSON: ${raw}`);
    }

    if (!isValidDiagnosis(parsed)) {
      throw new Error(`LLM diagnosis failed shape validation: ${raw}`);
    }

    return parsed;
  }

  async generateContent(arm: PlaybookArm, context: Record<string, string>): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: "system",
            content: `Fill in this content template using the provided context. Respond with only the filled content, no commentary.\n\nTemplate:\n${arm.template ?? ""}`,
          },
          { role: "user", content: JSON.stringify(context) },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `LLM generateContent request failed: ${response.status} ${response.statusText}`,
      );
    }

    const body = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return body.choices[0]?.message.content ?? "";
  }
}
