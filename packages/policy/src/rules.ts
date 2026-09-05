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

/**
 * The confidence ladder: an arm that hasn't resolved enough outcomes yet
 * *for this specific root cause* requires a human to sign off, exactly
 * like a high-risk action would — not because the action itself is risky,
 * but because the bandit's posterior for this segment is still close to
 * its uninformative prior. As outcomes accumulate past `minTrials`, the
 * identical action starts auto-passing: autonomy is earned per
 * (category, evidenceCode) bucket, not granted by a config flag. Never
 * part of `defaultRules()` — it changes when a case can pass, which
 * every autonomy-focused test and the seeded `pnpm demo` batch already
 * assert against; wired in only where a caller opts in explicitly (the
 * two live-server bootstraps).
 */
export function confidenceLadderRule(minTrials = 5): PolicyRule {
  return {
    id: "confidence_ladder",
    name: "Confidence Ladder",
    description: `Requires human approval until the selected arm has resolved at least ${minTrials} outcome(s) for this root cause`,
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      if (context.armTrials === undefined || context.armTrials >= minTrials) return null;
      return {
        ruleId: "confidence_ladder",
        decision: "NEEDS_APPROVAL",
        reason: `Only ${context.armTrials} resolved outcome(s) so far for this arm on this root cause — below the ${minTrials}-trial confidence threshold`,
      };
    },
  };
}

/**
 * RBI's e-mandate pre-debit notification rule: a scheduled Promise-to-Pay
 * retry charge may not execute until a pre-debit notice has been out for
 * at least `noticeMs` (24h, RBI's additional-factor-of-authentication
 * circular on recurring e-mandates) — "she said Tuesday, we notify
 * Monday, we charge Tuesday, not before." Only ever evaluates
 * `isPromiseRetry` contexts; a normal signal-triggered action always gets
 * `null` (not applicable) here. Never part of `defaultRules()` for the
 * same reason confidenceLadderRule isn't — it's wired in only where a
 * caller opts in explicitly (the two live-server bootstraps), each with
 * its own notice window so a live demo can compress 24h into something
 * actually watchable without a real deploy pretending 24h ever elapsed.
 */
export function preDebitNotificationRule(noticeMs = 24 * 60 * 60 * 1000): PolicyRule {
  return {
    id: "rbi_pre_debit_notice",
    name: "RBI Pre-Debit Notification",
    description: `A Promise-to-Pay retry requires a pre-debit notice at least ${noticeMs}ms old`,
    evaluate(context: PolicyContext): PolicyRuleResult | null {
      if (!context.isPromiseRetry) return null;
      if (context.preDebitNoticeSentAtMs === undefined) {
        return {
          ruleId: "rbi_pre_debit_notice",
          decision: "BLOCK",
          reason: "No RBI pre-debit notice has been sent for this promise — the retry cannot proceed",
        };
      }
      const elapsedMs = context.nowMs - context.preDebitNoticeSentAtMs;
      if (elapsedMs < noticeMs) {
        return {
          ruleId: "rbi_pre_debit_notice",
          decision: "DEFER",
          reason: `Only ${elapsedMs}ms since the pre-debit notice — RBI requires at least ${noticeMs}ms`,
        };
      }
      return null;
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
