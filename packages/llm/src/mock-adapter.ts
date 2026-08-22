import type { RiskSignal } from "@vasooli/core";
import type { DiagnosisOutput, LlmProvider, PlaybookArm } from "./provider.js";
import { categoryToSegmentHint } from "./provider.js";

/**
 * Deterministic offline provider: no network calls, seeded-free (pure
 * function of the signal) so demos and tests never depend on live LLM
 * credentials or non-determinism. This is what runs when OPENAI_API_KEY /
 * GROQ_API_KEY are absent from the environment — see design spec §11.
 */
export class MockLlmProvider implements LlmProvider {
  private readonly highValueThresholdPaise: bigint;

  constructor(highValueThresholdPaise = 10_00_00n /* ₹1,000 */) {
    this.highValueThresholdPaise = highValueThresholdPaise;
  }

  async diagnose(signal: RiskSignal): Promise<DiagnosisOutput> {
    const segment =
      signal.exposurePaise >= this.highValueThresholdPaise ? "high_value" : "standard";

    return {
      rootCause: `${categoryToSegmentHint(signal.category)} — derived from evidence on ${signal.entityId}`,
      confidence: 0.85,
      evidenceCode: this.evidenceCodeFor(signal),
      recommendedSegment: segment,
    };
  }

  async generateContent(arm: PlaybookArm, context: Record<string, string>): Promise<string> {
    if (!arm.template) return `[${arm.name}] no template configured`;
    let rendered = arm.template;
    for (const [key, value] of Object.entries(context)) {
      rendered = rendered.replaceAll(`{{ ${key} }}`, value);
    }
    return rendered;
  }

  private evidenceCodeFor(signal: RiskSignal): string {
    switch (signal.category) {
      case "payment_failure":
        return "issuer_down";
      case "checkout_abandonment":
        return "checkout_timeout";
      case "subscription_failure":
        return "mandate_charge_failed";
      case "b2b_receivable":
        return "promise_to_pay_breach";
    }
  }
}
