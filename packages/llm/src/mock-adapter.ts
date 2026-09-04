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

  /**
   * Derives a real, per-signal root-cause code from the detector's own
   * evidence rather than a fixed one-per-category constant — this is what
   * lets the bandit route by *why* a case is at risk, not just its
   * category (see @vasooli/orchestrator's contextual arm selection). Each
   * branch falls back to the old fixed code when the expected evidence
   * field is absent, so a signal built with no evidence (as in tests)
   * behaves exactly as before.
   */
  private evidenceCodeFor(signal: RiskSignal): string {
    const evidence = signal.evidence;
    switch (signal.category) {
      case "payment_failure": {
        const dominant = evidence.dominantErrorCode;
        return typeof dominant === "string" ? dominant : "issuer_down";
      }
      case "checkout_abandonment": {
        // detectCheckoutAbandonment reports `ageMs`; the live demo feed's
        // synthesized signals use `idleMs` for the same idea.
        const idleMs = Number(evidence.ageMs ?? evidence.idleMs ?? NaN);
        if (Number.isNaN(idleMs)) return "checkout_timeout";
        return idleMs < 10 * 60 * 1000 ? "quick_bounce" : "cart_review_dropoff";
      }
      case "subscription_failure": {
        const errorCode = evidence.errorCode;
        return typeof errorCode === "string" ? errorCode : "mandate_charge_failed";
      }
      case "b2b_receivable": {
        // Mirrors the aging tiers computed in
        // @vasooli/detector's b2b-receivables.ts (agingBucket()).
        switch (evidence.agingBucket) {
          case "30":
            return "early_reminder_needed";
          case "60":
            return "escalation_needed";
          case "90+":
            return "collections_needed";
          default:
            return "promise_to_pay_breach";
        }
      }
    }
  }
}
