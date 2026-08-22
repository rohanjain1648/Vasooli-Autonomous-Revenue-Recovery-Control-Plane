import type { PolicyContext, PolicyRule, PolicyRuleResult } from "./types.js";

/** TRAI DND-style quiet hours: no outreach 21:00–09:00 local time.
 * Defers rather than blocks — the case retries once quiet hours end. */
export function traiQuietHoursRule(
  quietStartHour = 21,
  quietEndHour = 9,
): PolicyRule {
  return {
    id: "trai_quiet_hours",
    name: "TRAI DND Quiet Hours",
    description: `No outreach between ${quietStartHour}:00 and ${quietEndHour}:00`,
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      const hour = new Date(context.nowMs).getHours();
      const inQuietWindow =
        quietStartHour > quietEndHour
          ? hour >= quietStartHour || hour < quietEndHour
          : hour >= quietStartHour && hour < quietEndHour;
      if (!inQuietWindow) return null;
      return {
        ruleId: "trai_quiet_hours",
        decision: "DEFER",
        reason: `Current hour ${hour}:00 falls within TRAI quiet hours (${quietStartHour}:00-${quietEndHour}:00)`,
      };
    },
  };
}

/** Never spend more chasing a case than it's worth recovering. */
export function economicViabilityRule(): PolicyRule {
  return {
    id: "economic_viability",
    name: "Economic Viability",
    description: "Action cost must not exceed estimated recoverable amount",
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      if (context.actionCostPaise <= context.estimatedRecoverablePaise) return null;
      return {
        ruleId: "economic_viability",
        decision: "BLOCK",
        reason: `Action cost ₹${(Number(context.actionCostPaise) / 100).toFixed(2)} exceeds estimated recoverable ₹${(Number(context.estimatedRecoverablePaise) / 100).toFixed(2)}`,
      };
    },
  };
}

/** Cap the number of outreach touches per case to avoid harassment and
 * diminishing returns. */
export function maxTouchesPerCaseRule(limit = 3): PolicyRule {
  return {
    id: "max_touches_per_case",
    name: "Max Touches Per Case",
    description: `No more than ${limit} outreach touches per case`,
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      if (context.recentTouches < limit) return null;
      return {
        ruleId: "max_touches_per_case",
        decision: "BLOCK",
        reason: `Case has already had ${context.recentTouches} touches (limit ${limit})`,
      };
    },
  };
}

/** Enforce a cool-off period between successive touches on the same case. */
export function coolOffBetweenTouchesRule(coolOffMs = 4 * 60 * 60 * 1000): PolicyRule {
  return {
    id: "cool_off_between_touches",
    name: "Cool-Off Between Touches",
    description: `At least ${coolOffMs}ms between touches on the same case`,
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      if (context.lastTouchAtMs === undefined) return null;
      const elapsed = context.nowMs - context.lastTouchAtMs;
      if (elapsed >= coolOffMs) return null;
      return {
        ruleId: "cool_off_between_touches",
        decision: "DEFER",
        reason: `Only ${elapsed}ms elapsed since last touch (cool-off ${coolOffMs}ms)`,
      };
    },
  };
}

/** Hard stops: a case already in a terminal-adjacent state (already
 * recovered, failed, or explicitly stopped) must never be acted on again. */
export function hardStopRule(): PolicyRule {
  return {
    id: "hard_stop_terminal",
    name: "Hard Stop — Terminal Case",
    description: "No action on a case already recovered, failed, or stopped",
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      const terminalStates = new Set(["recovered", "failed", "stopped"]);
      if (!terminalStates.has(context.case.state)) return null;
      return {
        ruleId: "hard_stop_terminal",
        decision: "BLOCK",
        reason: `Case is already in terminal state '${context.case.state}'`,
      };
    },
  };
}

/** High-risk actions (discounts, fee waivers, large amounts) require a
 * human to sign off before execution. */
export function humanApprovalForHighRiskRule(): PolicyRule {
  return {
    id: "human_approval_high_risk",
    name: "Human Approval For High-Risk Actions",
    description: "Discounts, fee waivers, or large amounts require approval",
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      if (!context.isHighRiskAction) return null;
      return {
        ruleId: "human_approval_high_risk",
        decision: "NEEDS_APPROVAL",
        reason: "Action involves a discount, fee waiver, or exceeds the auto-approve threshold",
      };
    },
  };
}

/** The default rule set used unless a caller supplies its own. */
export function defaultRules(): PolicyRule[] {
  return [
    hardStopRule(),
    traiQuietHoursRule(),
    economicViabilityRule(),
    maxTouchesPerCaseRule(),
    coolOffBetweenTouchesRule(),
    humanApprovalForHighRiskRule(),
  ];
}
