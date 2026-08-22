import { DECISION_PRIORITY } from "./types.js";
import type { PolicyContext, PolicyEvaluation, PolicyRule, PolicyRuleResult } from "./types.js";

/**
 * Deterministic policy engine: evaluates every rule against a context and
 * combines results by "most restrictive wins" (BLOCK > DEFER >
 * NEEDS_APPROVAL > PASS). Every rule's verdict is retained in the result
 * for audit purposes even when a stricter rule overrides it.
 */
export class PolicyEngine {
  constructor(private readonly rules: PolicyRule[]) {}

  evaluate(context: PolicyContext): PolicyEvaluation {
    const fired: PolicyRuleResult[] = [];
    for (const rule of this.rules) {
      const result = rule.evaluate(context);
      if (result !== null) fired.push(result);
    }

    if (fired.length === 0) {
      return {
        decisions: [],
        finalDecision: "PASS",
        finalReason: "No policy rule fired; action permitted",
      };
    }

    let governing = fired[0];
    for (const result of fired) {
      if (DECISION_PRIORITY[result.decision] > DECISION_PRIORITY[governing.decision]) {
        governing = result;
      }
    }

    return {
      decisions: fired,
      finalDecision: governing.decision,
      finalReason: governing.reason,
    };
  }
}
