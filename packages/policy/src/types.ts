import type { RecoveryCase } from "@vasooli/core";

export type PolicyDecision = "PASS" | "BLOCK" | "DEFER" | "NEEDS_APPROVAL";

/** Severity order used to pick the single governing decision when multiple
 * rules fire: a BLOCK always wins over DEFER, which wins over
 * NEEDS_APPROVAL, which wins over PASS. This mirrors "most restrictive
 * rule wins" — never silently downgrade a stricter rule's verdict. */
export const DECISION_PRIORITY: Record<PolicyDecision, number> = {
  BLOCK: 3,
  DEFER: 2,
  NEEDS_APPROVAL: 1,
  PASS: 0,
};

export interface PolicyRuleResult {
  ruleId: string;
  decision: PolicyDecision;
  reason: string;
}

/** Everything a rule needs to evaluate one case at one instant. */
export interface PolicyContext {
  case: RecoveryCase;
  nowMs: number;
  /** Number of outreach touches already made on this case. */
  recentTouches: number;
  /** Timestamp of the last touch, if any. */
  lastTouchAtMs?: number;
  /** Estimated ₹ recoverable if the action succeeds. */
  estimatedRecoverablePaise: bigint;
  /** Estimated ₹ cost of taking the action. */
  actionCostPaise: bigint;
  /** True if this action would require a discount, fee waiver, or exceeds
   * an amount threshold requiring a human's sign-off. */
  isHighRiskAction: boolean;
  /** Total resolved outcomes (successes + failures) backing the selected
   * bandit arm's posterior for this case's root cause — i.e. how much
   * evidence the arm has actually proven itself on, not just how many
   * times it's ever been tried across every root cause. Undefined when no
   * bandit arm is involved (the holdout counterfactual, a circuit-breaker
   * block). See confidenceLadderRule, the only rule that reads it. */
  armTrials?: number;
  /** True only for a scheduled Promise-to-Pay retry charge — a customer's
   * own promised date arriving, not a fresh risk signal. Never set on the
   * normal signal-triggered path. See preDebitNotificationRule, the only
   * rule that reads it (and preDebitNoticeSentAtMs below). */
  isPromiseRetry?: boolean;
  /** Epoch ms RBI's pre-debit notice was sent for this promise, or
   * undefined if it never was. Only meaningful when isPromiseRetry. */
  preDebitNoticeSentAtMs?: number;
}

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  evaluate: (context: PolicyContext) => PolicyRuleResult | null; // null = rule does not apply
}

export interface PolicyEvaluation {
  decisions: PolicyRuleResult[];
  /** The single most restrictive decision across all fired rules. */
  finalDecision: PolicyDecision;
  finalReason: string;
}
