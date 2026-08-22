import type { LeakageCategory, RiskSignal } from "@vasooli/core";

/**
 * Structured, Zod-shaped diagnosis output. The LLM is read-only: this is
 * the *only* thing it produces, and it never triggers money movement —
 * see design spec §2 (non-negotiable invariant). Every field here must be
 * validated before use by any caller.
 */
export interface DiagnosisOutput {
  rootCause: string;
  confidence: number; // 0..1
  evidenceCode: string; // e.g. "issuer_down", "checkout_timeout"
  recommendedSegment: "high_value" | "standard" | "at_risk";
}

export function isValidDiagnosis(d: unknown): d is DiagnosisOutput {
  if (typeof d !== "object" || d === null) return false;
  const o = d as Record<string, unknown>;
  return (
    typeof o.rootCause === "string" &&
    typeof o.confidence === "number" &&
    o.confidence >= 0 &&
    o.confidence <= 1 &&
    typeof o.evidenceCode === "string" &&
    (o.recommendedSegment === "high_value" ||
      o.recommendedSegment === "standard" ||
      o.recommendedSegment === "at_risk")
  );
}

export interface PlaybookArm {
  name: string;
  description: string;
  requiresApproval: boolean;
  template?: string;
}

/** Provider abstraction: every implementation is read-only and produces
 * only structured, validated output — never an action. */
export interface LlmProvider {
  diagnose(signal: RiskSignal): Promise<DiagnosisOutput>;
  generateContent(
    arm: PlaybookArm,
    context: Record<string, string>,
  ): Promise<string>;
}

export function categoryToSegmentHint(category: LeakageCategory): string {
  switch (category) {
    case "payment_failure":
      return "likely issuer or gateway side";
    case "checkout_abandonment":
      return "likely friction or price sensitivity";
    case "subscription_failure":
      return "likely mandate or funds issue";
    case "b2b_receivable":
      return "likely cashflow or dispute";
  }
}
