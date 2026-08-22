import { randomUUID } from "node:crypto";
import type { RiskSignal, LeakageCategory } from "@vasooli/core";
import { MockLlmProvider } from "@vasooli/llm";
import { FakeRazorpayClient } from "@vasooli/razorpay";
import { PolicyEngine, defaultRules } from "@vasooli/policy";
import type { CatalogArm, PlaybookCatalog } from "./playbooks.js";
import { EngineState } from "./state.js";

/** A single-arm-per-category catalog so tests can predict exactly which
 * arm the bandit will pick, instead of depending on real playbook content
 * (which can have several arms per category). */
export function fakeCatalog(overrides: Partial<Record<LeakageCategory, Partial<CatalogArm>>> = {}): PlaybookCatalog {
  const categories: LeakageCategory[] = [
    "payment_failure",
    "checkout_abandonment",
    "subscription_failure",
    "b2b_receivable",
  ];
  const armsByCategory = new Map<LeakageCategory, CatalogArm[]>();
  const arms: CatalogArm[] = [];
  for (const category of categories) {
    const arm: CatalogArm = {
      id: `test-${category}:nudge`,
      name: "nudge",
      description: "Test nudge",
      requiresApproval: false,
      template: "Hi {{ customer_name }}, amount {{ amount }}.",
      costPaise: 0n,
      playbookId: `test-${category}`,
      ...overrides[category],
    };
    arms.push(arm);
    armsByCategory.set(category, [arm]);
  }
  return { playbooks: [], arms, armsByCategory };
}

export function buildTestState(
  overrides: Partial<Record<LeakageCategory, Partial<CatalogArm>>> = {},
  holdoutPercent = 0,
) {
  return new EngineState({
    llmProvider: new MockLlmProvider(),
    razorpayClient: new FakeRazorpayClient(),
    policyEngine: new PolicyEngine(defaultRules()),
    catalog: fakeCatalog(overrides),
    rngSeed: 1,
    holdoutPercent,
  });
}

/** Fixed local hour 12:00 — outside TRAI quiet hours (21:00-09:00). */
export const DAYTIME_MS = new Date(2026, 0, 1, 12, 0, 0).getTime();

export function makeTestSignal(overrides: Partial<RiskSignal> = {}): RiskSignal {
  return {
    id: randomUUID(),
    category: "payment_failure",
    entityId: "cust_test",
    exposurePaise: 500_00n,
    detectedAt: new Date(DAYTIME_MS).toISOString(),
    evidence: { errorCode: "issuer_down" },
    ...overrides,
  };
}
