# Vasooli Plan 3: Policy Gate & Playbooks (Days 7–8)

> **Prerequisites:** Plan 2 complete (simulator & detectors running).  
> **Scope:** Policy DSL parser, evaluator, playbook catalog, state machine gaps (F5/F6).  
> **Stack:** TypeScript, YAML, Zod validation.

---

## Overview

**Goal:** Build a deterministic policy gate that guards every action. No playbook is executed without checking:
- TRAI DND quiet hours (21:00–09:00 defer)
- Economic viability (`expected_value > cost`)
- Frequency caps (max touches per case, cool-off between actions)
- Hard stops (opted-out, dispute, refund, already recovered)
- Human approval for high-value or risky actions

All policies are YAML-based, versioned, auditable. Every decision is logged to `policy_decisions` table.

---

## Deliverables

### 1. **packages/policy** (new)
Policy DSL parser and evaluator:
- `PolicyRule` interface: condition, action (PASS | BLOCK | DEFER | NEEDS_APPROVAL), reason
- `PolicyEngine` class: load YAML rules, evaluate against case context, return `PolicyDecision`
- `Condition` algebra: `all([cond1, cond2])`, `any([cond1, cond2])`, `not(cond)`, `==`, `<`, `>`, etc.
- Built-in rules: quiet hours, economic viability, touch frequency, hard stops

### 2. **playbooks/** (new directory)
YAML intervention catalog:
- `playbook-email-recovery.yaml`: email retry with subject variants
- `playbook-phone-ivr.yaml`: Hinglish IVR script (TTS-render ready)
- `playbook-offer-discount.yaml`: offer 5% discount on next payment (needs approval)
- `playbook-waive-fee.yaml`: waive late fee (needs approval)
- Each playbook: content template, arm assignments (bandit selection), cost estimate

### 3. **packages/core** extensions (F5, F6 fixes)
State machine gaps:
- **F5:** Add `deferred` state (for TRAI quiet-hour deferrals)
- **F6:** Allow holdout → stopped transition; allow executing → awaiting_approval edge

### 4. **Postgres schema** (migrations)
- `policy_decisions` table: case_id, rule_id, decision (PASS/BLOCK/DEFER/NEEDS_APPROVAL), reason, evaluated_at
- `approvals` table: decision_id, approved_by, approved_at, comment

### 5. **Tests**
- Golden-table tests: policy YAML rule against 20 scenario matrices
- State machine: holdout can reach stopped, executing can defer to awaiting_approval
- Determinism: same case + same rules → same decision

---

## Implementation Tasks

### Task 1: Implement `packages/policy`

**Files:**
- `packages/policy/package.json`
- `packages/policy/src/policy.ts` (PolicyRule, Condition, Engine)
- `packages/policy/src/rules.ts` (built-in rule factories)
- `packages/policy/src/loader.ts` (YAML → PolicyRule[])
- `packages/policy/src/evaluator.ts` (case context → PolicyDecision[])
- `packages/policy/src/index.ts`
- `packages/policy/src/*.test.ts`

**Key types:**
```typescript
export type PolicyDecision = "PASS" | "BLOCK" | "DEFER" | "NEEDS_APPROVAL";

export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  condition: Condition;
  decision: PolicyDecision;
  reason: string;
}

export interface PolicyContext {
  case: RecoveryCase;
  nowMs: number;
  recentTouches: number;
  lastTouchAt?: number;
  estimatedRecoverablePaise: bigint;
  actionCostPaise: bigint;
}

export class PolicyEngine {
  constructor(rules: PolicyRule[]);
  evaluate(context: PolicyContext): PolicyDecision[];
  // Returns: all decisions in rule order, allowing caller to pick BLOCK over DEFER, etc.
}
```

**Built-in rules:**
```typescript
export function traiBNDQuietHours(case: RecoveryCase, nowMs: number): PolicyDecision | null {
  const hour = new Date(nowMs).getHours();
  if (hour >= 21 || hour < 9) return "DEFER";
  return "PASS";
}

export function economicViability(estimatedRecoverable: bigint, actionCost: bigint): PolicyDecision | null {
  if (actionCost > estimatedRecoverable) return "BLOCK";
  return "PASS";
}

export function maxTouchesPerCase(recentTouches: number, limit: number = 3): PolicyDecision | null {
  if (recentTouches >= limit) return "BLOCK";
  return "PASS";
}

export function hardStops(case: RecoveryCase): PolicyDecision | null {
  if (case.state === "recovered" || case.state === "failed" || case.state === "stopped") {
    return "BLOCK"; // Already terminal
  }
  return "PASS";
}
```

**Tests:**
- Quiet hours: 22:30 → DEFER; 10:00 → PASS
- Economic: cost ₹50 vs recovery ₹40 → BLOCK
- Touch frequency: 3 touches, limit=3 → BLOCK; limit=5 → PASS
- Hard stops: case.state=recovered → BLOCK

### Task 2: Add state machine gaps (F5, F6)

**Modify:** `packages/core/src/state-machine.ts`

**Changes:**
- Add `deferred` to `CaseState` enum (types.ts line 14)
- Update `TRANSITIONS` table:
  ```typescript
  const TRANSITIONS: Record<CaseState, readonly CaseState[]> = {
    detected: ["diagnosing", "holdout", "stopped"],
    diagnosing: ["planned", "failed", "stopped"],
    planned: ["awaiting_approval", "executing", "stopped"],
    awaiting_approval: ["executing", "stopped", "deferred"],  // NEW: can defer
    executing: ["recovered", "failed", "stopped", "awaiting_approval"],  // NEW: can re-seek approval
    recovered: [],
    failed: [],
    stopped: [],
    holdout: ["recovered", "failed", "stopped"],  // NEW: holdout can stop
    deferred: ["awaiting_approval", "stopped"],  // NEW: deferred can retry or stop
  };
  ```
- Update tests: verify holdout→stopped, executing→awaiting_approval, deferred transitions

**Tests:**
- `transition("holdout", "stopped")` → returns "stopped"
- `transition("executing", "awaiting_approval")` → returns "awaiting_approval"
- `transition("deferred", "awaiting_approval")` → returns "awaiting_approval"
- `canTransition("holdout", "held")` → false (invalid)

### Task 3: Create playbook catalog

**Files:** `playbooks/*.yaml`

**Example structure:**
```yaml
# playbooks/email-recovery.yaml
id: email-recovery-v1
name: Email Recovery Outreach
category: payment_failure
cost_paise: 0  # No direct cost (email infrastructure assumed free)
cost_currency: "INR"  # For display

arms:
  - name: control
    description: No email
    content: null
  
  - name: email-reminder
    description: Friendly payment reminder
    template: |
      Hi {{ customer_name }},
      
      We noticed your recent payment didn't go through.
      Please retry: {{ retry_link }}
      
      Best,
      {{ merchant_name }} Team

  - name: email-offer
    description: 2% discount offer (needs approval)
    template: |
      Hi {{ customer_name }},
      
      Your payment needs attention. We're offering 2% off as a one-time courtesy.
      
      Claim: {{ offer_link }}
      
      Best,
      {{ merchant_name }} Team
    requires_approval: true

playbook_routing:
  - condition: "segment == 'high_value' && recent_failures < 2"
    arm: email-offer
  - condition: "else"
    arm: email-reminder
```

**Golden-table test:** 10 playbooks × 3 scenarios = 30 test cases verifying arm selection

### Task 4: Database migrations

**New migrations:**
- `001_create_policy_decisions_table.sql`
- `002_create_approvals_table.sql`
- `003_alter_recovery_cases_add_deferred_state.sql`

**Schema:**
```sql
CREATE TABLE policy_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES recovery_cases(id),
  rule_id VARCHAR(255) NOT NULL,
  decision VARCHAR(50) NOT NULL CHECK (decision IN ('PASS', 'BLOCK', 'DEFER', 'NEEDS_APPROVAL')),
  reason TEXT,
  evaluated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES policy_decisions(id),
  approved_by UUID NOT NULL,
  approved_at TIMESTAMP NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Task 5: Policy evaluator integration tests

**File:** `tests/integration/policy-gate.test.ts`

**Tests:**
- Quiet hours: case at 22:30 → PolicyEngine evaluates → decision includes DEFER
- Economic: recovery ₹100, cost ₹50 → decision includes PASS
- Playbook routing: segment=high_value → selects discount arm
- State machine: case in awaiting_approval can transition to deferred then back to awaiting_approval

---

## Self-Review Checklist

- [ ] Policy engine evaluates all built-in rules without external calls
- [ ] YAML playbooks load correctly, Zod-validate structure
- [ ] State machine accepts new transitions (holdout→stopped, executing→awaiting_approval)
- [ ] Deferred state flows: awaiting_approval → deferred → awaiting_approval → executing
- [ ] Policy decisions are persisted to policy_decisions table
- [ ] Golden-table tests cover 20+ decision matrices
- [ ] Determinism: same case context → same policy decision
- [ ] All tests pass with `pnpm test`
- [ ] TypeScript strict: `pnpm typecheck`

---

## Commits

Pattern:
```
feat(policy): add YAML-based policy DSL and evaluator

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

## Next: Plan 4

Once Plan 3 is verified (policies gate actions, state machine covers all paths, playbooks load), proceed to Plan 4: **LLM Agent & Executor** (Days 9–10).
